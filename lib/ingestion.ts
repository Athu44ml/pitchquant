import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { LEAGUES, SEASONS } from '@/lib/constants';
import { getSupabaseAdmin } from '@/lib/supabase';
import { normalizeTeamName, buildMatchRef, buildCheckpoints, parseCsvDate } from '@/lib/identity';
import type { TeamCanonical, Fixture, Checkpoint } from '@/lib/db/types';

function parseTheSportsDBDateTime(date: unknown, time: unknown): string | null {
  if (!date) return null;

  const datePart = String(date).trim();
  const timePart = time ? String(time).trim() : '00:00:00';
  const value = `${datePart}T${timePart}${/[zZ]|[+-]\d{2}:?\d{2}$/.test(timePart) ? '' : 'Z'}`;
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

/**
 * Ingest all historical CSV data into Supabase.
 * Parses every {prefix}-{season}.csv file, creates teams + fixtures + checkpoints.
 * Zero provider calls.
 */
export async function ingestCSVs(): Promise<{
  teamsCreated: number;
  fixturesCreated: number;
  checkpointsCreated: number;
  errors: string[];
}> {
  const sb = getSupabaseAdmin();
  const errors: string[] = [];
  let teamsCreated = 0;
  let fixturesCreated = 0;
  let checkpointsCreated = 0;

  // Pass 1: Extract all unique team names per league, create team_canonical entries
  const teamMap = new Map<string, string>(); // normalized_name -> team_id
  const teamRows: Omit<TeamCanonical, 'team_id' | 'created_at'>[] = [];

  for (const league of LEAGUES) {
    for (const season of SEASONS) {
      const filename = `${league.prefix}-${season.id}.csv`;
      const filepath = path.join(process.cwd(), 'public', filename);
      if (!fs.existsSync(filepath)) continue;

      try {
        let content = fs.readFileSync(filepath, 'utf-8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const parsed = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
        const matches = (parsed.data as any[]).filter((m) => m.HomeTeam && m.AwayTeam);

        for (const m of matches) {
          const homeName = String(m.HomeTeam);
          const awayName = String(m.AwayTeam);
          const homeNorm = normalizeTeamName(homeName);
          const awayNorm = normalizeTeamName(awayName);

          if (!teamMap.has(`${league.id}:${homeNorm}`)) {
            teamRows.push({
              league_id: league.id,
              season: season.id,
              canonical_name: homeName,
              normalized_name: homeNorm,
            });
            teamMap.set(`${league.id}:${homeNorm}`, homeNorm);
          }
          if (!teamMap.has(`${league.id}:${awayNorm}`)) {
            teamRows.push({
              league_id: league.id,
              season: season.id,
              canonical_name: awayName,
              normalized_name: awayNorm,
            });
            teamMap.set(`${league.id}:${awayNorm}`, awayNorm);
          }
        }
      } catch (err: any) {
        errors.push(`CSV parse error ${filename}: ${err.message}`);
      }
    }
  }

  // Upsert team_canonical (onConflict: league_id + normalized_name)
  if (teamRows.length > 0) {
    const { data, error } = await sb
      .from('team_canonical')
      .upsert(teamRows, { onConflict: 'league_id,normalized_name', ignoreDuplicates: true })
      .select('team_id,league_id,normalized_name');

    if (error) {
      errors.push(`team_canonical upsert: ${error.message}`);
      return { teamsCreated: 0, fixturesCreated: 0, checkpointsCreated: 0, errors };
    }

    teamsCreated = data?.length || 0;
    // Build reverse map: (league_id, normalized_name) -> team_id
    for (const row of data || []) {
      teamMap.set(`${row.league_id}:${row.normalized_name}`, row.team_id);
    }
  }

  // Pass 2: Create fixtures + checkpoints for every match
  const fixtureRows: Omit<Fixture, 'fixture_id' | 'created_at' | 'updated_at'>[] = [];

  for (const league of LEAGUES) {
    for (const season of SEASONS) {
      const filename = `${league.prefix}-${season.id}.csv`;
      const filepath = path.join(process.cwd(), 'public', filename);
      if (!fs.existsSync(filepath)) continue;

      try {
        let content = fs.readFileSync(filepath, 'utf-8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const parsed = Papa.parse(content, { header: true, dynamicTyping: true, skipEmptyLines: true });
        const matches = (parsed.data as any[]).filter((m) => m.HomeTeam && m.AwayTeam && m.Date);

        for (const m of matches) {
          const homeName = String(m.HomeTeam);
          const awayName = String(m.AwayTeam);
          const homeNorm = normalizeTeamName(homeName);
          const awayNorm = normalizeTeamName(awayName);
          const homeId = teamMap.get(`${league.id}:${homeNorm}`);
          const awayId = teamMap.get(`${league.id}:${awayNorm}`);

          if (!homeId || !awayId) {
            errors.push(`Missing team_id for ${homeName} or ${awayName} in ${filename}`);
            continue;
          }

          const matchRef = buildMatchRef(league.id, season.id, homeId, awayId);
          const kickoffUtc = parseCsvDate(String(m.Date));

          fixtureRows.push({
            provider: null,
            provider_fixture_id: null,
            league_id: league.id,
            season: season.id,
            home_team_id: homeId,
            away_team_id: awayId,
            match_ref: matchRef,
            status: 'finished', // CSV data is historical
            scheduled_kickoff_utc: kickoffUtc,
            actual_kickoff_utc: null,
            provider_updated_at: null,
            source: 'csv',
          });
        }
      } catch (err: any) {
        errors.push(`Fixture creation error ${filename}: ${err.message}`);
      }
    }
  }

  // Upsert fixtures (onConflict: match_ref)
  if (fixtureRows.length > 0) {
    const { data, error } = await sb
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'match_ref', ignoreDuplicates: true })
      .select('fixture_id,match_ref,scheduled_kickoff_utc');

    if (error) {
      errors.push(`fixtures upsert: ${error.message}`);
      return { teamsCreated, fixturesCreated: 0, checkpointsCreated: 0, errors };
    }

    fixturesCreated = data?.length || 0;

    // Build checkpoints for each fixture
    const checkpointRows: ReturnType<typeof buildCheckpoints> = [];
    for (const fx of data || []) {
      const cps = buildCheckpoints(fx.fixture_id, fx.scheduled_kickoff_utc);
      checkpointRows.push(...cps);
    }

    // Upsert checkpoints (onConflict: fixture_id,stage)
    if (checkpointRows.length > 0) {
      const { error: cpError } = await sb
        .from('checkpoints')
        .upsert(checkpointRows, { onConflict: 'fixture_id,stage', ignoreDuplicates: true });

      if (cpError) {
        errors.push(`checkpoints upsert: ${cpError.message}`);
      } else {
        checkpointsCreated = checkpointRows.length;
      }
    }
  }

  return { teamsCreated, fixturesCreated, checkpointsCreated, errors };
}

/**
 * Ingest live fixtures from TheSportsDB into Supabase.
 * Calls the existing sync-fixtures logic, materializes into Supabase.
 * Zero provider calls.
 */
export async function ingestTheSportsDB(): Promise<{
  teamsCreated: number;
  fixturesCreated: number;
  checkpointsCreated: number;
  errors: string[];
}> {
  const sb = getSupabaseAdmin();
  const errors: string[] = [];

  // Import the sync-fixtures logic dynamically to avoid circular deps
  const { GET } = await import('@/app/api/sync-fixtures/route');
  const req = new Request('http://localhost/api/sync-fixtures?league=all');
  const res = await GET(req);
  const payload = await res.json();

  if (payload.errors && payload.errors.length > 0) {
    errors.push(...payload.errors);
  }

  const fixtures: any[] = payload.fixtures || [];
  if (fixtures.length === 0) {
    return { teamsCreated: 0, fixturesCreated: 0, checkpointsCreated: 0, errors };
  }

  // Extract teams, create team_canonical entries
  const teamRows: Omit<TeamCanonical, 'team_id' | 'created_at'>[] = [];
  const teamMap = new Map<string, string>(); // league:normalized -> team_id

  for (const f of fixtures) {
    const homeNorm = normalizeTeamName(f.home);
    const awayNorm = normalizeTeamName(f.away);
    const homeKey = `${f.league}:${homeNorm}`;
    const awayKey = `${f.league}:${awayNorm}`;

    if (!teamMap.has(homeKey)) {
      teamRows.push({
        league_id: f.league,
        season: '26', // Current season
        canonical_name: f.home,
        normalized_name: homeNorm,
      });
      teamMap.set(homeKey, homeNorm);
    }
    if (!teamMap.has(awayKey)) {
      teamRows.push({
        league_id: f.league,
        season: '26',
        canonical_name: f.away,
        normalized_name: awayNorm,
      });
      teamMap.set(awayKey, awayNorm);
    }
  }

  let teamsCreated = 0;
  if (teamRows.length > 0) {
    const { data, error } = await sb
      .from('team_canonical')
      .upsert(teamRows, { onConflict: 'league_id,normalized_name', ignoreDuplicates: true })
      .select('team_id,league_id,normalized_name');

    if (error) {
      errors.push(`team_canonical upsert: ${error.message}`);
      return { teamsCreated: 0, fixturesCreated: 0, checkpointsCreated: 0, errors };
    }

    teamsCreated = data?.length || 0;
    for (const row of data || []) {
      teamMap.set(`${row.league_id}:${row.normalized_name}`, row.team_id);
    }
  }

  // Create fixtures + checkpoints
  const fixtureRows: Omit<Fixture, 'fixture_id' | 'created_at' | 'updated_at'>[] = [];

  for (const f of fixtures) {
    const homeNorm = normalizeTeamName(f.home);
    const awayNorm = normalizeTeamName(f.away);
    const homeId = teamMap.get(`${f.league}:${homeNorm}`);
    const awayId = teamMap.get(`${f.league}:${awayNorm}`);

    if (!homeId || !awayId) {
      errors.push(`Missing team_id for ${f.home} or ${f.away}`);
      continue;
    }

       const matchRef = buildMatchRef(f.league, '26', homeId, awayId);
    const kickoffUtc = parseTheSportsDBDateTime(f.date, f.time);

    if (!kickoffUtc) {
      errors.push(`Invalid date/time for ${f.home} vs ${f.away} (${f.date} ${f.time})`);
      continue;
    }

    fixtureRows.push({
      provider: 'thesportsdb',
      provider_fixture_id: f.sourceId,
      league_id: f.league,
      season: '26',
      home_team_id: homeId,
      away_team_id: awayId,
      match_ref: matchRef,
      status: 'scheduled',
      scheduled_kickoff_utc: kickoffUtc,
      actual_kickoff_utc: null,
      provider_updated_at: null,
      source: 'thesportsdb',
    });
  }

  let fixturesCreated = 0;
  let checkpointsCreated = 0;

  if (fixtureRows.length > 0) {
    const { data, error } = await sb
      .from('fixtures')
      .upsert(fixtureRows, { onConflict: 'match_ref', ignoreDuplicates: true })
      .select('fixture_id,match_ref,scheduled_kickoff_utc');

    if (error) {
      errors.push(`fixtures upsert: ${error.message}`);
      return { teamsCreated, fixturesCreated: 0, checkpointsCreated: 0, errors };
    }

    fixturesCreated = data?.length || 0;

    const checkpointRows: Omit<Checkpoint, 'checkpoint_id' | 'attempts' | 'captured_at' | 'created_at' | 'updated_at'>[] = [];
    for (const fx of data || []) {
      const cps = buildCheckpoints(fx.fixture_id, fx.scheduled_kickoff_utc);
      checkpointRows.push(...cps);
    }

    if (checkpointRows.length > 0) {
      const { error: cpError } = await sb
        .from('checkpoints')
        .upsert(checkpointRows, { onConflict: 'fixture_id,stage', ignoreDuplicates: true });

      if (cpError) {
        errors.push(`checkpoints upsert: ${cpError.message}`);
      } else {
        checkpointsCreated = checkpointRows.length;
      }
    }
  }

  return { teamsCreated, fixturesCreated, checkpointsCreated, errors };
}