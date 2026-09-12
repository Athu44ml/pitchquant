import type { CheckpointStage, Fixture } from '@/lib/db/types';

const CHECKPOINT_WINDOWS: Record<string, { mins: number; grace: number }> = {
  t_minus_24h: { mins: 24 * 60, grace: 30 },
  t_minus_6h: { mins: 6 * 60, grace: 30 },
  t_minus_1h: { mins: 60, grace: 15 },
  t_minus_15m: { mins: 15, grace: 5 },
  kickoff: { mins: 0, grace: 5 },
  half_time: { mins: -45, grace: 10 },
  full_time: { mins: -105, grace: 15 },
};

/**
 * Normalize a team name for identity matching.
 * Rules: lowercase, strip diacritics, collapse whitespace, keep suffixes (FC/CF).
 * No fuzzy matching — ambiguous names go to identity_review.
 */
export function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, '') // strip punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();
}

/**
 * Generate a match_ref from league/season/team IDs.
 * Format: {league_id}:{season}:{home_team_id}:{away_team_id}
 * This is the canonical fixture identifier across all data sources.
 */
export function buildMatchRef(
  leagueId: string,
  season: string,
  homeTeamId: string,
  awayTeamId: string
): string {
  return `${leagueId}:${season}:${homeTeamId}:${awayTeamId}`;
}

/**
 * Compute checkpoint windows for a fixture.
 * Returns 7 checkpoints with open/close times.
 * Window = [ko - mins - grace, ko - mins + grace]
 */
export function buildCheckpoints(
  fixtureId: string,
  kickoffUtc: string
): Array<{
  fixture_id: string;
  stage: CheckpointStage;
  open_at: string;
  close_at: string;
  status: 'pending';
}> {
  const ko = new Date(kickoffUtc).getTime();
  return (Object.keys(CHECKPOINT_WINDOWS) as CheckpointStage[]).map((stage) => {
    const { mins, grace } = CHECKPOINT_WINDOWS[stage];
    const target = ko - mins * 60 * 1000;
    const openAt = new Date(target - grace * 60 * 1000).toISOString();
    const closeAt = new Date(target + grace * 60 * 1000).toISOString();
    return {
      fixture_id: fixtureId,
      stage,
      open_at: openAt,
      close_at: closeAt,
      status: 'pending' as const,
    };
  });
}

/**
 * Parse a CSV date string (YYYY-MM-DD) as UTC midnight.
 * CSV files don't include timezone info, so we treat them as UTC.
 * This is consistent across all leagues.
 */
export function parseCsvDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00.000Z');
  return d.toISOString();
}

/**
 * Parse a TheSportsDB fixture (date + time) as UTC.
 * TheSportsDB provides date (YYYY-MM-DD) and time (HH:MM:SS) separately.
 */
export function parseTheSportsDBDateTime(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min, s] = (time || '00:00:00').split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, h || 0, min || 0, s || 0));
  return dt.toISOString();
}

/**
 * Validate a fixture status against the schema enum.
 */
export function validateFixtureStatus(status: string): Fixture['status'] {
  const valid = ['scheduled', 'postponed', 'cancelled', 'finished', 'abandoned'];
  return valid.includes(status) ? (status as Fixture['status']) : 'scheduled';
}