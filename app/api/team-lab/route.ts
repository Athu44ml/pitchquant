import { NextResponse } from 'next/server';
import { getSeasonData, marketHit, getOddsForMarket } from '@/lib/dataProcessor';
import { profitAllowed } from '@/lib/datasets';
import { aggregatePerf, Leg } from '@/lib/perf';

type Row = Leg & { venue: string; opponent: string };

const BUCKETS: [string, number, number][] = [
  ['1.01–1.20', 1.01, 1.2], ['1.21–1.40', 1.21, 1.4], ['1.41–1.60', 1.41, 1.6],
  ['1.61–2.00', 1.61, 2.0], ['2.01+', 2.01, 1000],
];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';
  const team = q.get('team') || '';
  const market = q.get('market') || 'over-1.5';
  if (!team) return NextResponse.json({ error: 'No team' }, { status: 400 });

  const { matches } = getSeasonData(league, season);
  const allowed = profitAllowed(market);

  const rows: Row[] = [];
  (matches as any[]).forEach((m) => {
    if (m.HomeTeam !== team && m.AwayTeam !== team) return;
    const isHome = m.HomeTeam === team;
    const hit = marketHit(m, market, isHome);
        if (typeof hit !== 'boolean') return;
    const odds = allowed ? getOddsForMarket(m, market, isHome) : null;
    rows.push({ odds, hit, date: String(m.Date), venue: isHome ? 'H' : 'A', opponent: isHome ? m.AwayTeam : m.HomeTeam });
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));

  const agg = (list: Row[]) => aggregatePerf(list, market);
  const overview = agg(rows);

  return NextResponse.json({
    team, market,
    oddsBasis: overview.oddsBasis,
    overview,
    home: agg(rows.filter((r) => r.venue === 'H')),
    away: agg(rows.filter((r) => r.venue === 'A')),
    // Odds buckets only exist where real bookmaker odds exist
    buckets: allowed
      ? BUCKETS.map(([range, lo, hi]) => ({ range, ...agg(rows.filter((r) => r.odds != null && r.odds >= lo && r.odds < hi)) }))
      : [],
    form: rows.slice(-10).reverse().map((r) => ({
      date: r.date, opponent: r.opponent, venue: r.venue, odds: r.odds, hit: r.hit,
      profit: r.odds != null ? Math.round(r.hit ? (r.odds - 1) * 100 : -100) : null,
    })),
  });
}