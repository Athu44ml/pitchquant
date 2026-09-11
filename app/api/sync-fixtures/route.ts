import { NextResponse } from 'next/server';

// TheSportsDB free public API — no key signup needed (test key "3" is public)
const API = 'https://www.thesportsdb.com/api/v1/json/3';

const LEAGUE_TARGETS = [
  { id: 'epl', country: 'England', expected: 'English Premier League', keyword: 'Premier League', name: 'Premier League' },
  { id: 'spain', country: 'Spain', expected: 'Spanish La Liga', keyword: 'La Liga', name: 'La Liga' },
  { id: 'germany', country: 'Germany', expected: 'German Bundesliga', keyword: 'Bundesliga', name: 'Bundesliga' },
  { id: 'italy', country: 'Italy', expected: 'Italian Serie A', keyword: 'Serie A', name: 'Serie A' },
  { id: 'france', country: 'France', expected: 'French Ligue 1', keyword: 'Ligue 1', name: 'Ligue 1' },
  { id: 'netherlands', country: 'Netherlands', expected: 'Dutch Eredivisie', keyword: 'Eredivisie', name: 'Eredivisie' },
  { id: 'belgium', country: 'Belgium', expected: 'Belgian Jupiler Pro League', keyword: 'Pro League', name: 'Belgian Pro League' },
  { id: 'portugal', country: 'Portugal', expected: 'Portuguese Primeira Liga', keyword: 'Primeira Liga', name: 'Primeira Liga' },
];

const BLACKLIST = ['2.', 'II', 'Championship', 'Segunda', 'Ligue 2', 'Serie B', '2nd'];

const g: any = globalThis;
if (!g.tsdCache) g.tsdCache = { leagueIds: {} as Record<string, string>, events: null as any, time: 0, key: '' };

async function findLeagueId(country: string, expected: string, keyword: string): Promise<string | null> {
  if (g.tsdCache.leagueIds[country]) return g.tsdCache.leagueIds[country];
  try {
    const res = await fetch(`${API}/search_all_leagues.php?country=${encodeURIComponent(country)}&sport=Soccer`);
    if (!res.ok) return null;
    const data = await res.json();
    const leagues: any[] = data.leagues || [];
    let hit = leagues.find((l) => String(l.strLeague) === expected);
    if (!hit) {
      hit = leagues.find((l) => {
        const n = String(l.strLeague || '');
        return n.includes(keyword) && !BLACKLIST.some((b) => n.includes(b));
      });
    }
    if (hit?.idLeague) {
      g.tsdCache.leagueIds[country] = hit.idLeague;
      return hit.idLeague;
    }
  } catch {}
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get('league') || 'all';

  // Server-side cache: 30 minutes (be nice to the free API)
  if (g.tsdCache.events && g.tsdCache.key === league && Date.now() - g.tsdCache.time < 30 * 60 * 1000) {
    return NextResponse.json(g.tsdCache.events);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const targets = league === 'all' ? LEAGUE_TARGETS : LEAGUE_TARGETS.filter((t) => t.id === league);

  const fixtures: any[] = [];
  const errors: string[] = [];

  for (const t of targets) {
    try {
      const id = await findLeagueId(t.country, t.expected, t.keyword);
      if (!id) { errors.push(`${t.name}: league not found in feed`); continue; }

      const res = await fetch(`${API}/eventsnextleague.php?id=${id}`);
      if (!res.ok) { errors.push(`${t.name}: HTTP ${res.status}`); continue; }
      const data = await res.json();

      for (const e of data.events || []) {
        if (!e.dateEvent || !e.strHomeTeam || !e.strAwayTeam) continue;
        if (e.dateEvent < todayStr) continue; // upcoming only
        fixtures.push({
          id: `tsd-${e.idEvent}`,
          sourceId: e.idEvent,
          date: e.dateEvent,
          time: String(e.timeEvent || '').slice(0, 5),
          league: t.id,
          leagueName: t.name,
          home: e.strHomeTeam,
          away: e.strAwayTeam,
          source: 'thesportsdb',
        });
      }
    } catch (err: any) {
      errors.push(`${t.name}: ${err?.message || 'fetch failed'}`);
    }
  }

  fixtures.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));

  const payload = {
    fixtures,
    count: fixtures.length,
    errors,
    source: 'TheSportsDB free feed (keyless)',
  };

  g.tsdCache.events = payload;
  g.tsdCache.time = Date.now();
  g.tsdCache.key = league;

  return NextResponse.json(payload);
}