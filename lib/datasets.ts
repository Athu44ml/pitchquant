import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';

export type DatasetMeta = {
  league: string; season: string; file: string | null;
  matches: number; played: number;
  dateFrom: string | null; dateTo: string | null;
  oddsColumns: string[]; source: string;
};

export const REAL_ODDS_MARKETS = ['win', 'under-2.5'];
export const CONSTANT_ODDS_MARKETS = ['over-1.5', 'btts', 'win-or-draw', 'no-draw'];
const PREFIX: Record<string, string> = { epl: 'epl', spain: 'sp', italy: 'itl', germany: 'ger', france: 'fra', netherlands: 'ned', belgium: 'bel', portugal: 'por' };

const cache: Record<string, DatasetMeta> = {};
const sk = (d: string) => d.split('/').reverse().join('-');

export function getDatasetMeta(league: string, season: string): DatasetMeta {
  const key = `${league}|${season}`;
  if (cache[key]) return cache[key];
  const fname = `${PREFIX[league] || league}-${season}.csv`;
  const file = path.join(process.cwd(), 'public', fname);
  const meta: DatasetMeta = { league, season, file: null, matches: 0, played: 0, dateFrom: null, dateTo: null, oddsColumns: [], source: 'football-data.co.uk CSV (operator-uploaded)' };
  if (fs.existsSync(file)) {
    meta.file = fname;
    const parsed = Papa.parse(fs.readFileSync(file, 'utf-8'), { header: true, skipEmptyLines: true });
    const rows = parsed.data as any[];
    meta.matches = rows.length;
    meta.played = rows.filter((r) => r.FTR && r.FTHG !== '' && r.FTHG != null).length;
    const dates = rows.map((r) => String(r.Date || '')).filter(Boolean).sort((a, b) => sk(a).localeCompare(sk(b)));
    meta.dateFrom = dates[0] || null;
    meta.dateTo = dates[dates.length - 1] || null;
    meta.oddsColumns = ((parsed.meta.fields as string[]) || []).filter((f) => /B365|Avg/.test(f));
  }
  cache[key] = meta;
  return meta;
}

export function oddsBasisFor(market: string): 'bookmaker' | 'constant' {
  return REAL_ODDS_MARKETS.includes(market) ? 'bookmaker' : 'constant';
}
export function profitAllowed(market: string): boolean { return REAL_ODDS_MARKETS.includes(market); }
export function marketClassification(market: string): 'BOOKMAKER_ODDS' | 'RESULTS_ONLY' {
  return profitAllowed(market) ? 'BOOKMAKER_ODDS' : 'RESULTS_ONLY';
}
export function datasetState(league: string, season: string, todayIso: string): 'COMPLETED_SEASON' | 'CURRENT_SEASON' | 'NO_DATA' {
  const m = getDatasetMeta(league, season);
  if (!m.file || m.matches === 0) return 'NO_DATA';
  return (m.dateTo || '') < todayIso ? 'COMPLETED_SEASON' : 'CURRENT_SEASON';
}

// ---- fixture identity (never silently merge uncertain fixtures) ----
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export type FixtureId = { home: string; away: string; kickoffUTC: string | null; league: string; season: string };
export function fixtureKey(f: FixtureId) { return `${f.league}|${f.season}|${normName(f.home)}|${normName(f.away)}|${f.kickoffUTC || 'nokickoff'}`; }
export function matchFixtures(a: FixtureId, b: FixtureId): { same: boolean; flags: string[] } {
  const flags: string[] = [];
  if (normName(a.home) !== normName(b.home)) flags.push('home-team-mismatch');
  if (normName(a.away) !== normName(b.away)) flags.push('away-team-mismatch');
  if (a.kickoffUTC && b.kickoffUTC) {
    if (a.kickoffUTC !== b.kickoffUTC) {
      const da = new Date(a.kickoffUTC).getTime(), db = new Date(b.kickoffUTC).getTime();
      if (Math.abs(da - db) < 24 * 3600_000 && a.kickoffUTC.slice(0, 10) === b.kickoffUTC.slice(0, 10)) flags.push('kickoff-time-diff');
      else flags.push('kickoff-mismatch');
    }
  } else flags.push('kickoff-unspecified');
  const same = flags.length === 0 || (flags.length === 1 && flags[0] === 'kickoff-time-diff');
  return { same, flags };
}

// ---- timezone policy: provider = UTC; CSV kickoffs = as-published, tz unspecified; never compare raw ----
export function providerKickoffUTC(isoStr: string) { return isoStr; }
export function csvKickoff(date: string, time: string) { return { iso: `${date}T${time || '00:00'}:00`, tz: 'unspecified' as const }; }