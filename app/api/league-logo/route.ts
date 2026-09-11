import { NextResponse } from 'next/server';

const TARGETS: Record<string, { country: string; expected: string; keyword: string }> = {
  epl: { country: 'England', expected: 'English Premier League', keyword: 'Premier League' },
  spain: { country: 'Spain', expected: 'Spanish La Liga', keyword: 'La Liga' },
  germany: { country: 'Germany', expected: 'German Bundesliga', keyword: 'Bundesliga' },
  italy: { country: 'Italy', expected: 'Italian Serie A', keyword: 'Serie A' },
  france: { country: 'France', expected: 'French Ligue 1', keyword: 'Ligue 1' },
  netherlands: { country: 'Netherlands', expected: 'Dutch Eredivisie', keyword: 'Eredivisie' },
  belgium: { country: 'Belgium', expected: 'Belgian Jupiler Pro League', keyword: 'Pro League' },
  portugal: { country: 'Portugal', expected: 'Portuguese Primeira Liga', keyword: 'Primeira Liga' },
};

const g: any = globalThis;
if (!g.leagueLogoCache) g.leagueLogoCache = {} as Record<string, string | null>;

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id') || '';
  const t = TARGETS[id];
  if (!t) return NextResponse.json({ badge: null });
  if (g.leagueLogoCache[id] !== undefined) return NextResponse.json({ badge: g.leagueLogoCache[id] });

  try {
    const s = await fetch(`https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?country=${encodeURIComponent(t.country)}&sport=Soccer`);
    if (!s.ok) { g.leagueLogoCache[id] = null; return NextResponse.json({ badge: null }); }
    const sd = await s.json();
    const leagues: any[] = sd.leagues || [];
    const hit =
      leagues.find((l) => String(l.strLeague) === t.expected) ||
      leagues.find((l) => String(l.strLeague || '').includes(t.keyword));
    if (!hit?.idLeague) { g.leagueLogoCache[id] = null; return NextResponse.json({ badge: null }); }

    const l = await fetch(`https://www.thesportsdb.com/api/v1/json/3/lookupleague.php?id=${hit.idLeague}`);
    if (!l.ok) { g.leagueLogoCache[id] = null; return NextResponse.json({ badge: null }); }
    const ld = await l.json();
    const badge = ld.leagues?.[0]?.strBadge || null;
    g.leagueLogoCache[id] = badge;
    return NextResponse.json({ badge });
  } catch {
    g.leagueLogoCache[id] = null;
    return NextResponse.json({ badge: null });
  }
}