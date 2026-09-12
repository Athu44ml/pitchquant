-- ============================================================================
-- PitchQuant odds archive foundation (Phase 1)
-- Idempotent: safe on fresh or fully-migrated databases.
-- Invariants enforced here (never in app code alone):
--   * one checkpoint per (fixture, stage); stages exclude ENDED by CHECK
--   * terminal checkpoint states are immutable via trigger
--   * cancelling a fixture cancels its pending/retry checkpoints via trigger
--   * snapshot uniqueness is LOGICAL (fixture+stage+market+selection+bookmaker),
--     never time-based, so retries cannot duplicate observations
--   * no odds value outside (1, 1000) can be stored
-- ============================================================================

create or replace function pq_set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 1. team_canonical -----------------------------------------------------------
-- Identity namespace = (league_id, normalized_name). `season` is PROVENANCE
-- only (season first registered); team_id stays stable across seasons.
create table if not exists team_canonical (
  team_id         uuid primary key default gen_random_uuid(),
  league_id       text not null,
  season          text not null,
  canonical_name  text not null,
  normalized_name text not null,
  created_at      timestamptz not null default now(),
  constraint team_canonical_norm_uniq unique (league_id, normalized_name)
);
comment on column team_canonical.season is 'Season first registered (provenance). Identity namespace is (league_id, normalized_name); team_id is stable across seasons.';

-- 2. team_alias — curated only. NO fuzzy matching anywhere. -------------------
create table if not exists team_alias (
  alias_id         uuid primary key default gen_random_uuid(),
  team_id          uuid not null references team_canonical(team_id) on delete cascade,
  alias            text not null,
  normalized_alias text not null,
  source           text,
  created_at       timestamptz not null default now(),
  constraint team_alias_norm_uniq unique (normalized_alias)
);
create index if not exists team_alias_team_idx on team_alias (team_id);
comment on constraint team_alias_norm_uniq on team_alias is 'Global curated alias space. Ambiguous variants go to identity_review, never auto-resolved.';

-- 3. identity_review — human queue. Nothing auto-approved. --------------------
create table if not exists identity_review (
  review_id                uuid primary key default gen_random_uuid(),
  provider                 text,
  provider_team_name       text,
  normalized_provider_name text,
  suggested_team_id        uuid references team_canonical(team_id) on delete set null,
  status                   text not null default 'pending',
  reason                   text,
  created_at               timestamptz not null default now(),
  reviewed_at              timestamptz,
  constraint identity_review_status_chk check (status in ('pending', 'approved', 'rejected'))
);

-- 4. fixtures — lifetime-stable identity. -------------------------------------
-- match_ref = {league_id}:{season}:{home_team_id}:{away_team_id}
create table if not exists fixtures (
  fixture_id            uuid primary key default gen_random_uuid(),
  provider              text,
  provider_fixture_id   text,
  league_id             text not null,
  season                text not null,
  home_team_id          uuid not null references team_canonical(team_id),
  away_team_id          uuid not null references team_canonical(team_id),
  match_ref             text not null,
  status                text not null default 'scheduled',
  scheduled_kickoff_utc timestamptz not null,
  actual_kickoff_utc    timestamptz,
  provider_updated_at   timestamptz,
  source                text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint fixtures_status_chk check (status in ('scheduled','postponed','cancelled','finished','abandoned')),
  constraint fixtures_match_ref_uniq unique (match_ref),
  constraint fixtures_teams_differ check (home_team_id <> away_team_id)
);
create unique index if not exists fixtures_provider_id_uniq
  on fixtures (provider, provider_fixture_id)
  where provider_fixture_id is not null;
create index if not exists fixtures_league_kickoff_idx on fixtures (league_id, scheduled_kickoff_utc);
drop trigger if exists fixtures_touch_updated on fixtures;
create trigger fixtures_touch_updated
  before update on fixtures
  for each row execute function pq_set_updated_at();

-- 5. provider_fixture_map — PK prevents one provider id -> two fixtures -------
create table if not exists provider_fixture_map (
  provider            text not null,
  provider_fixture_id text not null,
  fixture_id          uuid not null references fixtures(fixture_id) on delete cascade,
  created_at          timestamptz not null default now(),
  primary key (provider, provider_fixture_id)
);
create index if not exists provider_fixture_map_fixture_idx on provider_fixture_map (fixture_id);

-- 6. checkpoints — precomputed capture queue. ENDED is NOT a stage. -----------
create table if not exists checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  fixture_id    uuid not null references fixtures(fixture_id) on delete cascade,
  stage         text not null,
  open_at       timestamptz not null,
  close_at      timestamptz not null,
  status        text not null default 'pending',
  attempts      integer not null default 0,
  captured_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint checkpoints_stage_chk check (stage in
    ('T_MINUS_12H','T_MINUS_6H','T_MINUS_3H','T_MINUS_1H','T_MINUS_30M','T_MINUS_15M','KICKOFF')),
  constraint checkpoints_status_chk check (status in
    ('pending','retry','captured','missed','cancelled','skipped_duplicate')),
  constraint checkpoints_window_chk check (open_at < close_at),
  constraint checkpoints_captured_chk check (status <> 'captured' or captured_at is not null),
  constraint checkpoints_fixture_stage_uniq unique (fixture_id, stage)
);
create index if not exists checkpoints_status_open_idx  on checkpoints (status, open_at);
create index if not exists checkpoints_status_close_idx on checkpoints (status, close_at);
drop trigger if exists checkpoints_touch_updated on checkpoints;
create trigger checkpoints_touch_updated
  before update on checkpoints
  for each row execute function pq_set_updated_at();

-- Terminal states immutable: a retry can never overwrite captured/missed/etc.
create or replace function pq_checkpoint_immutable() returns trigger
language plpgsql as $$
begin
  if old.status in ('captured','missed','skipped_duplicate','cancelled') then
    raise exception 'checkpoint % is terminal (%) and immutable', old.checkpoint_id, old.status;
  end if;
  return new;
end $$;
drop trigger if exists checkpoints_immutable on checkpoints;
create trigger checkpoints_immutable
  before update on checkpoints
  for each row execute function pq_checkpoint_immutable();

-- Cancelling a fixture cancels its pending/retry checkpoints (DB-level).
create or replace function pq_cancel_checkpoints_on_cancel() returns trigger
language plpgsql as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update checkpoints
       set status = 'cancelled'
     where fixture_id = new.fixture_id
       and status in ('pending','retry');
  end if;
  return new;
end $$;
drop trigger if exists fixtures_cancel_checkpoints on fixtures;
create trigger fixtures_cancel_checkpoints
  after update of status on fixtures
  for each row execute function pq_cancel_checkpoints_on_cancel();

-- 7. odds_snapshots — observed prices ONLY. Results live in match_results. ----
create table if not exists odds_snapshots (
  snapshot_id                   uuid primary key default gen_random_uuid(),
  fixture_id                    uuid not null references fixtures(fixture_id) on delete cascade,
  checkpoint_id                 uuid references checkpoints(checkpoint_id) on delete set null,
  stage                         text not null,
  captured_at                   timestamptz not null,
  minutes_to_kickoff_at_capture numeric,
  market                        text not null,
  selection                     text not null,
  bookmaker                     text not null,
  odds                          numeric(7,3) not null,
  opening_odds                  numeric(7,3),
  provider_updated_at           timestamptz,
  created_at                    timestamptz not null default now(),
  constraint odds_snapshots_stage_chk check (stage in
    ('T_MINUS_12H','T_MINUS_6H','T_MINUS_3H','T_MINUS_1H','T_MINUS_30M','T_MINUS_15M','KICKOFF')),
  constraint odds_snapshots_odds_range_chk check (odds > 1 and odds < 1000),
  constraint odds_snapshots_open_range_chk check (opening_odds is null or (opening_odds > 1 and opening_odds < 1000)),
  constraint odds_snapshots_logical_uniq unique (fixture_id, stage, market, selection, bookmaker)
);
create index if not exists odds_snapshots_fixture_stage_idx  on odds_snapshots (fixture_id, stage);
create index if not exists odds_snapshots_fixture_time_idx   on odds_snapshots (fixture_id, captured_at);
create index if not exists odds_snapshots_fixture_mkt_idx    on odds_snapshots (fixture_id, market, selection);
create index if not exists odds_snapshots_book_mkt_idx       on odds_snapshots (bookmaker, market);
comment on constraint odds_snapshots_logical_uniq on odds_snapshots is 'Logical observation key. captured_at is deliberately NOT part of uniqueness: retries must upsert, not duplicate.';

-- 8. match_results — ENDED lives here, separate from odds_snapshots -----------
create table if not exists match_results (
  result_id   uuid primary key default gen_random_uuid(),
  fixture_id  uuid not null references fixtures(fixture_id) on delete cascade,
  score_home  integer,
  score_away  integer,
  status      text,
  source      text,
  ingested_at timestamptz not null default now(),
  constraint match_results_fixture_source_uniq unique (fixture_id, source)
);

-- 9. capture_log — OUR request accounting, NOT a verified provider quota ------
create table if not exists capture_log (
  capture_id        uuid primary key default gen_random_uuid(),
  run_id            uuid not null,
  provider          text not null,
  request_scope     text not null,
  league_id         text,
  requested_at      timestamptz not null,
  completed_at      timestamptz,
  status            text not null,
  provider_requests integer not null default 0,
  fixtures_seen     integer not null default 0,
  snapshots_written integer not null default 0,
  error_code        text,
  error_message     text,
  created_at        timestamptz not null default now(),
  constraint capture_log_status_chk check (status in ('ok','error','partial','skipped_budget'))
);
create index if not exists capture_log_requested_idx      on capture_log (requested_at);
create index if not exists capture_log_provider_time_idx  on capture_log (provider, requested_at);
create index if not exists capture_log_run_idx            on capture_log (run_id);

-- RLS — project pattern: RLS on EVERY table; anon/authenticated SELECT only on
-- public-safe tables; NO client writes anywhere; service_role bypasses for
-- ingestion; capture_log/identity_review/provider_fixture_map stay invisible.
alter table team_canonical       enable row level security;
alter table team_alias           enable row level security;
alter table identity_review      enable row level security;
alter table fixtures             enable row level security;
alter table provider_fixture_map enable row level security;
alter table checkpoints          enable row level security;
alter table odds_snapshots       enable row level security;
alter table match_results        enable row level security;
alter table capture_log          enable row level security;

drop policy if exists pq_public_read on team_canonical;
create policy pq_public_read on team_canonical for select to anon, authenticated using (true);
drop policy if exists pq_public_read on team_alias;
create policy pq_public_read on team_alias for select to anon, authenticated using (true);
drop policy if exists pq_public_read on fixtures;
create policy pq_public_read on fixtures for select to anon, authenticated using (true);
drop policy if exists pq_public_read on checkpoints;
create policy pq_public_read on checkpoints for select to anon, authenticated using (true);
drop policy if exists pq_public_read on odds_snapshots;
create policy pq_public_read on odds_snapshots for select to anon, authenticated using (true);
drop policy if exists pq_public_read on match_results;
create policy pq_public_read on match_results for select to anon, authenticated using (true);
-- identity_review, provider_fixture_map, capture_log: intentionally no policiesgit status