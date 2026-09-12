import { getSupabaseAdmin } from '@/lib/supabase';
import { getScheduledFixtures, getFinishedFixtures } from '@/lib/provider5d';
import { normalizeTeamName, buildMatchRef, buildCheckpoints } from '@/lib/identity';

const MAX_CALLS_PER_RUN = 8;
const DAILY_CEILING = 900;
const DRIFT_MS = 90 * 60 * 1000;
const ODDS_CAPTURE = process.env.ODDS_CAPTURE === 'true'; // flip true after Pro upgrade

const LEAGUE_MAP: Array<{ id: string; match: string; reject: string[] }> = [
  { id: 'epl', match: 'Premier League', reject: ['Championship'] },
  { id: 'spain', match: 'La Liga', reject: ['Segunda'] },
  { id: 'germany', match: 'Bundesliga', reject: ['2.'] },
  { id: 'italy', match: 'Serie A', reject: ['Serie B'] },
  { id: 'france', match: 'Ligue 1', reject: ['Ligue 2'] },
  { id: 'netherlands', match: 'Eredivisie', reject: [] },
  { id: 'belgium', match: 'Pro League', reject: [] },
];
export function mapProviderLeague(name?: string): string | null {
  if (!name) return null;
  for (const e of LEAGUE_MAP) {
    if (e.reject.some((r) => name.includes(r))) continue;
    if (name.includes(e.match)) return e.id;
  }
  return null;
}

async function logRun(sb: any, runId: string, start: Date, status: string, calls: number, seen: number, written: number, code: string | null, msg: string | null) {
  await sb.from('capture_log').insert({
    run_id: runId, provider: 'fivedollar', request_scope: 'cron', league_id: null,
    requested_at: start.toISOString(), completed_at: new Date().toISOString(), status,
    provider_requests: calls, fixtures_seen: seen, snapshots_written: written,
    error_code: code, error_message: msg,
  });
}

export async function capturePass() {
  const sb = getSupabaseAdmin();
  const runId = crypto.randomUUID();
  const start = new Date();
  const errors: string[] = [];
  let calls = 0, seen = 0, written = 0;

  // Daily ceiling from our own ledger (NOT a provider quota mirror)
  const d = new Date(); d.setUTCHours(0, 0, 0, 0);
  const { data: ledger } = await sb.from('capture_log').select('provider_requests').gte('requested_at', d.toISOString());
  const used = (ledger || []).reduce((s: number, r: any) => s + (r.provider_requests || 0), 0);
  if (used >= DAILY_CEILING) {
    await logRun(sb, runId, start, 'skipped_budget', 0, 0, 0, 'daily_ceiling', null);
    return { callsMade: 0, fixturesSeen: 0, snapshotsWritten: 0, errors: ['daily ceiling reached'] };
  }

  // 1) DISCOVERY: scheduled fixtures (1 call)
  const sched = await getScheduledFixtures(100);
  calls++;
  if (sched.error) {
    await logRun(sb, runId, start, 'error', calls, 0, 0, 'discovery', sched.error);
    return { callsMade: calls, fixturesSeen: 0, snapshotsWritten: 0, errors: [`discovery: ${sched.error}`] };
  }

  const { data: teams } = await sb.from('team_canonical').select('team_id,league_id,normalized_name');
  const teamMap = new Map<string, string>();
  for (const t of teams || []) teamMap.set(`${t.league_id}:${t.normalized_name}`, t.team_id);

  const rows: any[] = [];
  const kickoffByRef = new Map<string, string>();
  const refs: string[] = [];
  for (const f of sched.data || []) {
    const leagueId = mapProviderLeague(f.league?.name);
    if (!leagueId) continue;
    seen++;
    const homeId = teamMap.get(`${leagueId}:${normalizeTeamName(String(f.teams?.home?.name || ''))}`);
    const awayId = teamMap.get(`${leagueId}:${normalizeTeamName(String(f.teams?.away?.name || ''))}`);
    if (!homeId || !awayId || homeId === awayId) continue;
    const ref = buildMatchRef(leagueId, '26', homeId, awayId);
    refs.push(ref);
    kickoffByRef.set(ref, String(f.kickoff_utc));
    rows.push({
      provider: 'fivedollar', provider_fixture_id: String(f.id), league_id: leagueId, season: '26',
      home_team_id: homeId, away_team_id: awayId, match_ref: ref, status: 'scheduled',
      scheduled_kickoff_utc: String(f.kickoff_utc), actual_kickoff_utc: null,
      provider_updated_at: new Date().toISOString(), source: 'fivedollar',
    });
  }

  if (rows.length) {
    await sb.from('fixtures').upsert(rows, { onConflict: 'match_ref', ignoreDuplicates: true });
    // Attach provider ids to pre-existing (CSV-sourced) scheduled fixtures
    await sb.from('fixtures').update({ provider: 'fivedollar', provider_updated_at: new Date().toISOString() })
      .in('match_ref', refs).eq('status', 'scheduled').is('provider_fixture_id', null);
    for (const r of rows) {
      await sb.from('fixtures').update({ provider_fixture_id: r.provider_fixture_id })
        .eq('match_ref', r.match_ref).eq('status', 'scheduled');
    }
  }

  // Kickoff drift > 90min: provider time wins; recompute pending windows
  if (refs.length) {
    const { data: fx } = await sb.from('fixtures').select('fixture_id,match_ref,scheduled_kickoff_utc,status').in('match_ref', refs);
    const mapRows: any[] = [];
    const cpRows: any[] = [];
    for (const f of fx || []) {
      const pid = rows.find((r) => r.match_ref === f.match_ref)?.provider_fixture_id;
      if (pid) mapRows.push({ provider: 'fivedollar', provider_fixture_id: pid, fixture_id: f.fixture_id });
      if (f.status !== 'scheduled') continue;
      const provKo = kickoffByRef.get(f.match_ref);
      if (provKo && Math.abs(Date.parse(provKo) - Date.parse(f.scheduled_kickoff_utc)) > DRIFT_MS) {
        await sb.from('fixtures').update({ scheduled_kickoff_utc: provKo, provider_updated_at: new Date().toISOString() }).eq('fixture_id', f.fixture_id);
        const { data: pend } = await sb.from('checkpoints').select('checkpoint_id,stage').eq('fixture_id', f.fixture_id).in('status', ['pending', 'retry']);
        for (const cp of pend || []) {
          const win = buildCheckpoints(f.fixture_id, provKo).find((w) => w.stage === cp.stage);
          if (win) await sb.from('checkpoints').update({ open_at: win.open_at, close_at: win.close_at }).eq('checkpoint_id', cp.checkpoint_id);
        }
        continue;
      }
      cpRows.push(...buildCheckpoints(f.fixture_id, f.scheduled_kickoff_utc));
    }
    if (mapRows.length) await sb.from('provider_fixture_map').upsert(mapRows, { onConflict: 'provider,provider_fixture_id', ignoreDuplicates: true });
    if (cpRows.length) await sb.from('checkpoints').upsert(cpRows, { onConflict: 'fixture_id,stage', ignoreDuplicates: true });
  }

  // 2) RESULTS reconciliation (1 call)
  if (calls < MAX_CALLS_PER_RUN) {
    const fin = await getFinishedFixtures(100);
    calls++;
    if (!fin.error) {
      for (const f of fin.data || []) {
        const { data: fx } = await sb.from('fixtures').select('fixture_id').eq('provider_fixture_id', String(f.id)).limit(1);
        const fid = fx?.[0]?.fixture_id;
        if (!fid) continue;
        await sb.from('fixtures').update({ status: 'finished', actual_kickoff_utc: String(f.kickoff_utc), provider_updated_at: new Date().toISOString() }).eq('fixture_id', fid);
        await sb.from('match_results').upsert({
          fixture_id: fid, score_home: f.goals?.home ?? null, score_away: f.goals?.away ?? null,
          status: 'finished', source: 'fivedollar',
        }, { onConflict: 'fixture_id,source', ignoreDuplicates: true });
      }
    } else errors.push(`results: ${fin.error}`);
  }

  // 3) ODDS phase: gated. Free plan cannot read odds; never fabricate, never waste calls.
  if (ODDS_CAPTURE) {
    errors.push('odds_capture_enabled: parser pending post-upgrade probe');
  }

  // 4) Reconciliation: expired windows become missed (or cancelled for dead fixtures)
  const { data: dead } = await sb.from('fixtures').select('fixture_id').in('status', ['postponed', 'cancelled']);
  if (dead?.length) {
    await sb.from('checkpoints').update({ status: 'cancelled' }).in('fixture_id', dead.map((x: any) => x.fixture_id)).in('status', ['pending', 'retry']);
  }
  await sb.from('checkpoints').update({ status: 'missed' }).in('status', ['pending', 'retry']).lt('close_at', new Date().toISOString());

  await logRun(sb, runId, start, errors.length ? 'partial' : 'ok', calls, seen, written, errors[0]?.slice(0, 80) || null, errors.join(' | ').slice(0, 500) || null);
  return { callsMade: calls, fixturesSeen: seen, snapshotsWritten: written, errors };
}