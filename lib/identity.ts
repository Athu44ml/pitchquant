import type { CheckpointStage, Fixture } from '@/lib/db/types';
import { CHECKPOINT_WINDOWS } from '@/lib/db/types';

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
 * Parse football-data CSV dates: YYYY-MM-DD (newer) or DD/MM/YYYY / DD/MM/YY (older).
 * Returns null on unparseable input — callers must skip, never guess.
 */
export function parseCsvDate(dateStr: string): string | null {
  const s = String(dateStr).trim();
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    iso = `${s}T00:00:00.000Z`;
  } else {
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) {
      let [, d, mo, y] = m;
      if (y.length === 2) y = String(2000 + Number(y)); // SEASONS starts 15/16 => 20xx
      iso = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00.000Z`;
    }
  }
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * TheSportsDB date+time -> ISO UTC, or null if unparseable.
 */
export function parseTheSportsDBDateTimeSafe(date: unknown, time: unknown): string | null {
  if (!date) return null;
  const datePart = String(date).trim();
  const timePart = time ? String(time).trim() : '00:00:00';
  const value = `${datePart}T${timePart}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(timePart) ? '' : 'Z'}`;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Validate a fixture status against the schema enum.
 */
export function validateFixtureStatus(status: string): Fixture['status'] {
  const valid = ['scheduled', 'postponed', 'cancelled', 'finished', 'abandoned'];
  return valid.includes(status) ? (status as Fixture['status']) : 'scheduled';
}