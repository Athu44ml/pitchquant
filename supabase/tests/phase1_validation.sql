-- Phase 1 schema validation. Synthetic data only. Ends with ROLLBACK: nothing persists.
-- Convention: every intentional FAIL marker uses errcode P9001 so it can never be
-- absorbed by handlers expecting real constraint/trigger SQLSTATEs.
begin;
do $$
declare
  v_home uuid; v_away uuid; v_fix uuid; v_fix2 uuid; v_cnt int;
  v_stages text[] := array['T_MINUS_12H','T_MINUS_6H','T_MINUS_3H','T_MINUS_1H','T_MINUS_30M','T_MINUS_15M','KICKOFF'];
  v_s text;
begin
  insert into team_canonical (league_id, season, canonical_name, normalized_name)
    values ('epl','26','Test Home FC','testhomefc') returning team_id into v_home;
  insert into team_canonical (league_id, season, canonical_name, normalized_name)
    values ('epl','26','Test Away FC','testawayfc') returning team_id into v_away;

  insert into fixtures (league_id, season, home_team_id, away_team_id, match_ref, scheduled_kickoff_utc, source)
    values ('epl','26', v_home, v_away, 'epl:26:'||v_home||':'||v_away, now() + interval '1 day', 'test')
    returning fixture_id into v_fix;
  insert into fixtures (league_id, season, home_team_id, away_team_id, match_ref, scheduled_kickoff_utc, source)
    values ('epl','26', v_away, v_home, 'epl:26:'||v_away||':'||v_home, now() + interval '2 day', 'test')
    returning fixture_id into v_fix2;

  -- (a) exactly 7 checkpoints per fixture; ENDED rejected; duplicate stage rejected
  foreach v_s in array v_stages loop
    insert into checkpoints (fixture_id, stage, open_at, close_at)
      values (v_fix, v_s, now() + interval '1 hour', now() + interval '70 minutes');
    insert into checkpoints (fixture_id, stage, open_at, close_at)
      values (v_fix2, v_s, now() + interval '1 hour', now() + interval '70 minutes');
  end loop;
  select count(*) into v_cnt from checkpoints where fixture_id = v_fix;
  if v_cnt <> 7 then raise exception 'FAIL: expected 7 checkpoints, got %', v_cnt using errcode = 'P9001'; end if;
  begin
    insert into checkpoints (fixture_id, stage, open_at, close_at) values (v_fix, 'ENDED', now(), now() + interval '5 minutes');
    raise exception 'FAIL: ENDED checkpoint accepted' using errcode = 'P9001';
  exception when check_violation then null; -- expected: stage whitelist
  end;
  begin
    insert into checkpoints (fixture_id, stage, open_at, close_at)
      values (v_fix, 'T_MINUS_12H', now(), now() + interval '5 minutes');
    raise exception 'FAIL: duplicate (fixture_id, stage) accepted' using errcode = 'P9001';
  exception when unique_violation then null; -- expected: one checkpoint per stage
  end;

  -- (b) duplicate logical snapshot rejected
  insert into odds_snapshots (fixture_id, stage, captured_at, market, selection, bookmaker, odds)
    values (v_fix, 'T_MINUS_12H', now(), 'win', 'home', 'bet365', 2.100);
  begin
    insert into odds_snapshots (fixture_id, stage, captured_at, market, selection, bookmaker, odds)
      values (v_fix, 'T_MINUS_12H', now() + interval '1 minute', 'win', 'home', 'bet365', 2.150);
    raise exception 'FAIL: duplicate logical snapshot accepted' using errcode = 'P9001';
  exception when unique_violation then null; -- expected: logical uniqueness
  end;

  -- (c) provider fixture id cannot map to two fixtures
  update fixtures set provider = 'fivedollar', provider_fixture_id = 'PF-1' where fixture_id = v_fix;
  insert into provider_fixture_map (provider, provider_fixture_id, fixture_id) values ('fivedollar','PF-1', v_fix);
  begin
    insert into provider_fixture_map (provider, provider_fixture_id, fixture_id) values ('fivedollar','PF-1', v_fix2);
    raise exception 'FAIL: provider id mapped to second fixture' using errcode = 'P9001';
  exception when unique_violation then null; -- expected: map PK
  end;

  -- (d) captured checkpoint immutable (retry cannot replace it)
  update checkpoints set status = 'captured', captured_at = now()
    where fixture_id = v_fix and stage = 'T_MINUS_12H';
  begin
    update checkpoints set status = 'retry', attempts = 1
      where fixture_id = v_fix and stage = 'T_MINUS_12H';
    raise exception 'FAIL: captured checkpoint mutated' using errcode = 'P9001';
  exception when raise_exception then null; -- expected: immutability trigger (P0001); FAIL marker is P9001 and would propagate
  end;

  -- (e) results stay separate from snapshots
  insert into match_results (fixture_id, score_home, score_away, status, source)
    values (v_fix, 2, 1, 'finished', 'csv');
  select count(*) into v_cnt from odds_snapshots where fixture_id = v_fix;
  if v_cnt <> 1 then raise exception 'FAIL: snapshot count changed after result insert' using errcode = 'P9001'; end if;

  -- (f) postponement must NOT mutate captured or pending statuses
  update fixtures set status = 'postponed', scheduled_kickoff_utc = scheduled_kickoff_utc + interval '1 day'
    where fixture_id = v_fix;
  select count(*) into v_cnt from checkpoints where fixture_id = v_fix and stage = 'T_MINUS_12H' and status = 'captured';
  if v_cnt <> 1 then raise exception 'FAIL: postponement mutated captured checkpoint' using errcode = 'P9001'; end if;
  select count(*) into v_cnt from checkpoints where fixture_id = v_fix and status = 'pending';
  if v_cnt <> 6 then raise exception 'FAIL: postponement altered pending statuses (%)', v_cnt using errcode = 'P9001'; end if;

  -- (g) cancelling a fixture cancels pending checkpoints only
  update fixtures set status = 'cancelled' where fixture_id = v_fix2;
  select count(*) into v_cnt from checkpoints where fixture_id = v_fix2 and status = 'cancelled';
  if v_cnt <> 7 then raise exception 'FAIL: cancel cascade incomplete (%)', v_cnt using errcode = 'P9001'; end if;

  raise notice 'PHASE1 VALIDATION PASSED';
end $$;
rollback;