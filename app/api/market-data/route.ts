import { NextResponse } from 'next/server';
import { getSeasonData, marketHit, getOddsForMarket } from '@/lib/dataProcessor';
import { profitAllowed, marketClassification } from '@/lib/datasets';
import { aggregatePerf, Leg } from '@/lib/perf';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const market = searchParams.get('market') || 'over-1.5';
  const league = searchParams.get('league') || 'epl';
  const season = searchParams.get('season') || '26';
  const team = searchParams.get('team') || '';

  const { matches } = getSeasonData(league, season);
  const allowed = profitAllowed(market);

  const teamSet = new Set<string>();
  (matches as any[]).forEach((m) => { teamSet.add(m.HomeTeam); teamSet.add(m.AwayTeam); });
  const teams = Array.from(teamSet).sort();

  const legs: Leg[] = [];
  (matches as any[])
    .filter((m) => m.HomeTeam === team || m.AwayTeam === team)
    .forEach((m) => {
      const isHome = m.HomeTeam === team;
      const hit = marketHit(m, market, isHome);
            if (typeof hit !== 'boolean') return;
      // Constant illustrative odds are NEVER read for non-bookmaker markets
      const odds = allowed ? getOddsForMarket(m, market, isHome) : null;
      legs.push({ odds, hit, date: String(m.Date) });
    });
  legs.sort((a, b) => a.date.localeCompare(b.date));

  const perf = aggregatePerf(legs, market);

  let money = 0, net = 0;
  const graphData = legs.map((l, i) => {
    net += l.hit ? 1 : -1;
    if (l.odds != null) money += l.hit ? (l.odds - 1) * 100 : -100;
    return { matchweek: i + 1, cumulative: allowed ? money : net, hit: l.hit };
  });

  return NextResponse.json({
    teams,
    oddsBasis: perf.oddsBasis,
    marketClassification: marketClassification(market),
    graphData,
    totalStaked: perf.totalStaked,
    finalProfit: perf.profit,
    roi: perf.roi,
    results: { n: perf.n, wins: perf.wins, losses: perf.losses, winRate: perf.winRate },
  });
}