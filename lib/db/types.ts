// Row types mirroring supabase/migrations/20260911000000_odds_archive_foundation.sql
// Conventions: uuid -> string, numeric -> number, timestamptz -> ISO string.
// Regenerate via `supabase gen types` once the CLI is adopted.

export const CHECKPOINT_STAGES = [
  'T_MINUS_12H', 'T_MINUS_6H', 'T_MINUS_3H', 'T_MINUS_1H', 'T_MINUS_30M', 'T_MINUS_15M', 'KICKOFF',
] as const;
export type CheckpointStage = (typeof CHECKPOINT_STAGES)[number];

export const CHECKPOINT_STATUSES = [
  'pending', 'retry', 'captured', 'missed', 'cancelled', 'skipped_duplicate',
] as const;
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number];

export const FIXTURE_STATUSES = [
  'scheduled', 'postponed', 'cancelled', 'finished', 'abandoned',
] as const;
export type FixtureStatus = (typeof FIXTURE_STATUSES)[number];

export interface TeamCanonical {
  team_id: string; league_id: string; season: string;
  canonical_name: string; normalized_name: string; created_at: string;
}
export interface TeamAlias {
  alias_id: string; team_id: string; alias: string;
  normalized_alias: string; source: string | null; created_at: string;
}
export interface IdentityReview {
  review_id: string; provider: string | null; provider_team_name: string | null;
  normalized_provider_name: string | null; suggested_team_id: string | null;
  status: 'pending' | 'approved' | 'rejected'; reason: string | null;
  created_at: string; reviewed_at: string | null;
}
export interface Fixture {
  fixture_id: string; provider: string | null; provider_fixture_id: string | null;
  league_id: string; season: string; home_team_id: string; away_team_id: string;
  match_ref: string; status: FixtureStatus; scheduled_kickoff_utc: string;
  actual_kickoff_utc: string | null; provider_updated_at: string | null;
  source: string | null; created_at: string; updated_at: string;
}
export interface ProviderFixtureMap {
  provider: string; provider_fixture_id: string; fixture_id: string; created_at: string;
}
export interface Checkpoint {
  checkpoint_id: string; fixture_id: string; stage: CheckpointStage;
  open_at: string; close_at: string; status: CheckpointStatus; attempts: number;
  captured_at: string | null; created_at: string; updated_at: string;
}
export interface OddsSnapshot {
  snapshot_id: string; fixture_id: string; checkpoint_id: string | null;
  stage: CheckpointStage; captured_at: string; minutes_to_kickoff_at_capture: number | null;
  market: string; selection: string; bookmaker: string; odds: number;
  opening_odds: number | null; provider_updated_at: string | null; created_at: string;
}
export interface MatchResult {
  result_id: string; fixture_id: string; score_home: number | null; score_away: number | null;
  status: string | null; source: string | null; ingested_at: string;
}
export interface CaptureLog {
  capture_id: string; run_id: string; provider: string; request_scope: string;
  league_id: string | null; requested_at: string; completed_at: string | null;
  status: 'ok' | 'error' | 'partial' | 'skipped_budget'; provider_requests: number;
  fixtures_seen: number; snapshots_written: number; error_code: string | null;
  error_message: string | null; created_at: string;
}
// Checkpoint windows (minutes before kickoff + grace in minutes).
// Window = [ko - mins - grace, ko - mins + grace]; >=12min wide so a
// 10-minute cron tick always lands inside every window.
export const CHECKPOINT_WINDOWS: Record<CheckpointStage, { mins: number; grace: number }> = {
  T_MINUS_12H: { mins: 720, grace: 60 },
  T_MINUS_6H:  { mins: 360, grace: 40 },
  T_MINUS_3H:  { mins: 180, grace: 25 },
  T_MINUS_1H:  { mins: 60,  grace: 12 },
  T_MINUS_30M: { mins: 30,  grace: 8 },
  T_MINUS_15M: { mins: 15,  grace: 6 },
  KICKOFF:     { mins: 0,   grace: 6 },
};