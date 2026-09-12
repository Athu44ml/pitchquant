import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { LEAGUES, SEASONS } from '@/lib/constants';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeTeamName, buildMatchRef, buildCheckpoints, parseCsvDate, parseTheSportsDBDateTimeSafe } from '@/lib/identity';
import type { TeamCanonical, Fixture } from '@/lib/db/types';

const CHUNK = 400;

export type IngestResult = {
  teamsCreated: number;
  fixturesCreated: number;
  checkpointsCreated: number;
  errors: string[];
};

function chunk<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Chunked upsert; returns inserted rows only; collects errors without aborting. */
async function upsertChunks(sb: any, table: string, rows: any[], onConflict: string) {
  const inserted: any[] = [];
  const errors: string[] = [];
  for (const c of chunk(rows)) {
    const { data, error } = await sb.from(table).upsert(c, { onConflict, ignoreDuplicates: true }).select();
    if (error) errors.push(`${table} upsert: ${error.message}`);
    else inserted.push(...(data || []));
  }
  return { inserted, errors };
}

/** Full (league, normalized_name) -> team_id map from DB. Never trust upsert return alone. */
async function loadTeamMap(sb: any, leagueIds: string[]) {
  const map = new Map<string, string>();
  const { data, error } = await sb
    .from('team_canonical')
    .select('team_id,league_id,normalized_name')
    .in('league_id', leagueIds);
  if (error) return { map, error: error.message as string };
  for (const r of data || []) map.set(`${r.league_id}:${r.normalized_name}`, r.team_id);
  return { map, error: null };
}

function readCsv(filename: string): any[] | null {
  const filepath = path.join(process.cwd(), 'public', filename);
  if (!fs.existsSync(filepath)) return null;
  let content = fs.readFileSync(filepath, 'utf-8');
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const parsed = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
  return (parsed.data as any[]).filter((m) => m.HomeTeam && m.AwayTeam);
}

/**
 * Historical CSV ingestion: teams + fixtures only.
 * NO checkpoints here by design — checkpoints are a capture queue for
 * UPCOMING fixtures; historical matches are already finished.
 */
export async function ingestCSVs(leagueFilter?: string): Promise<IngestResult> {
  const sb = getSupabaseAdmin();
  const errors: string[] = [];
  const scope = LEAGUES.filter((l) => !leagueFilter || l.id === leagueFilter);
  if (scope.length === 0) return { teamsCreated: 0, fixturesCreated: 0, checkpointsCreated: 0, errors: [`unknown league ${leagueFilter}`] };

  // Pass 1: team rows (deduped in-memory)
  const seen = new Set<string>();
  const teamRows: Omit<TeamCanonical, 'team_id' | 'created_at'>[] = [];
  for (const league of scope) {
    for (const season of SEASONS) {
      const matches = readCsv(`${league.prefix}-${season.id}.csv`);
      if (!matches) continue;
      for (const m of matches) {
        for (const raw of [String(m.HomeTeam), String(m.AwayTeam)]) {
          const norm = normalizeTeamName(raw);
          const key = `${league.id}:${norm}`;
          if (seen.has(key)) continue;
          seen.add(key);
          teamRows.push({ league_id: league.id, season: season.id, canonical_name: raw, normalized_name: norm });
        }
      }
    }
  }
  const teams = await upsertChunks(sb, 'team_canonical', teamRows, 'league_id,normalized_name');
  errors.push(...teams.errors);

  // Full map from DB (fixes re-run / cross-run blindness)
  const { map: teamMap, error: mapErr } = await loadTeamMap(sb, scope.map((l) => l.id));
  if (mapErr) return { teamsCreated: teams.inserted.length, fixturesCreated: 0, checkpointsCreated: 0, errors: [...errors, `team map: ${mapErr}`] };

  // Pass 2: fixtures
  const fixtureRows: Omit<Fixture, 'fixture_id' | 'created_at' | 'updated_at'>[] = [];
  for (const league of scope) {
    for (const season of SEASONS) {
      const matches = readCsv(`${league.prefix}-${season.id}.csv`);
      if (!matches) continue;
      for (const m of matches) {
        const homeId = teamMap.get(`${league.id}:${normalizeTeamName(String(m.HomeTeam))}`);
        const awayId = teamMap.get(`${league.id}:${normalizeTeamName(String(m.AwayTeam))}`);
        if (!homeId || !awayId) { errors.push(`missing team_id in ${league.prefix}-${season.id}.csv: ${m.HomeTeam} v ${m.AwayTeam}`); continue; }
        if (homeId === awayId) { errors.push(`same team both sides in ${league.prefix}-${season.id}.csv: ${m.HomeTeam}`); continue; }
        const ko = parseCsvDate(String(m.Date));
        if (!ko) { errors.push(`bad date in ${league.prefix}-${season.id}.csv: ${m.Date} (${m.HomeTeam} v ${m.AwayTeam})`); continue; }
        fixtureRows.push({
          provider: null, provider_fixture_id: null,
          league_id: league.id, season: season.id,
          home_team_id: homeId, away_team_id: awayId,
          match_ref: buildMatchRef(league.id, season.id, homeId, awayId),
          status: 'finished', scheduled_kickoff_utc: ko,
          actual_kickoff_utc: null, provider_updated_at: null, source: 'csv',
        });
      }
    }
  }
  const fx = await upsertChunks(sb, 'fixtures', fixtureRows, 'match_ref');
  errors.push(...fx.errors);

  return { teamsCreated: teams.inserted.length, fixturesCreated: fx.inserted.length, checkpointsCreated: 0, errors };
}

/**
 * Live fixture ingestion via existing TheSportsDB sync route (internal call).
 * Creates teams, fixtures, AND the 7 capture checkpoints per upcoming fixture.
 */
export async function ingestTheSportsDB(): Promise<IngestResult> {
  const sb = getSupabaseAdmin();
  const errors: string[] = [];

  const { GET } = await import('@/app/api/sync-fixtures/route');
  const res = await GET(new Request('http://localhost/api/sync-fixtures?league=all'));
  const payload = await res.json();
  if (payload.errors?.length) errors.push(...payload.errors);

  const leagueIds = LEAGUES.map((l) => l.id);
  const fixtures: any[] = (payload.fixtures || []).filter((f: any) => leagueIds.includes(f.league));
  if (fixtures.length === 0) return { teamsCreated: 0, fixturesCreated: 0, checkpointsCreated: 0, errors };

  const seen = new Set<string>();
  const teamRows: Omit<TeamCanonical, 'team_id' | 'created_at'>[] = [];
  for (const f of fixtures) {
    for (const raw of [f.home, f.away]) {
      const norm = normalizeTeamName(raw);
      const key = `${f.league}:${norm}`;
      if (seen.has(key)) continue;
      seen.add(key);
      teamRows.push({ league_id: f.league, season: '26', canonical_name: raw, normalized_name: norm });
    }
  }
  const teams = await upsertChunks(sb, 'team_canonical', teamRows, 'league_id,normalized_name');
  errors.push(...teams.errors);

  const { map: teamMap, error: mapErr } = await loadTeamMap(sb, leagueIds);
  if (mapErr) return { teamsCreated: teams.inserted.length, fixturesCreated: 0, checkpointsCreated: 0, errors: [...errors, `team map: ${mapErr}`] };

  const fixtureRows: Omit<Fixture, 'fixture_id' | 'created_at' | 'updated_at'>[] = [];
  for (const f of fixtures) {
    const homeId = teamMap.get(`${f.league}:${normalizeTeamName(f.home)}`);
    const awayId = teamMap.get(`${f.league}:${normalizeTeamName(f.away)}`);
    if (!homeId || !awayId) { errors.push(`missing team_id: ${f.home} v ${f.away}`); continue; }
    if (homeId === awayId) continue;
    const ko = parseTheSportsDBDateTimeSafe(f.date, f.time);
    if (!ko) { errors.push(`bad datetime: ${f.home} v ${f.away} (${f.date} ${f.time})`); continue; }
    fixtureRows.push({
      provider: 'thesportsdb', provider_fixture_id: String(f.sourceId),
      league_id: f.league, season: '26',
      home_team_id: homeId, away_team_id: awayId,
      match_ref: buildMatchRef(f.league, '26', homeId, awayId),
      status: 'scheduled', scheduled_kickoff_utc: ko,
      actual_kickoff_utc: null, provider_updated_at: null, source: 'thesportsdb',
    });
  }
  const fx = await upsertChunks(sb, 'fixtures', fixtureRows, 'match_ref');
  errors.push(...fx.errors);

  // Checkpoints ONLY for upcoming fixtures (including ones inserted on earlier runs)
  const { data: upcoming, error: upErr } = await sb
    .from('fixtures')
    .select('fixture_id,scheduled_kickoff_utc')
    .eq('provider', 'thesportsdb')
    .gt('scheduled_kickoff_utc', new Date().toISOString());
  if (upErr) return { teamsCreated: teams.inserted.length, fixturesCreated: fx.inserted.length, checkpointsCreated: 0, errors: [...errors, upErr.message] };

  const cpRows: any[] = [];
  for (const f of upcoming || []) cpRows.push(...buildCheckpoints(f.fixture_id, f.scheduled_kickoff_utc));
  const cps = await upsertChunks(sb, 'checkpoints', cpRows, 'fixture_id,stage');
  errors.push(...cps.errors);

  return { teamsCreated: teams.inserted.length, fixturesCreated: fx.inserted.length, checkpointsCreated: cps.inserted.length, errors };
}