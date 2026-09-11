import { NextResponse } from 'next/server';
import { getSeasonData, marketHit, getOddsForMarket } from '@/lib/dataProcessor';
import { aggregatePerf, Leg } from '@/lib/perf';
import { profitAllowed, marketClassification } from '@/lib/datasets';
import { iso } from '@/lib/model';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';
  const market = q.get('market') || 'over-1.5';
  const minOdds = Number(q.get('minOdds') || 1.01);
  const maxOdds = Number(q.get('maxOdds') || 50);
  const minWinRate = Number(q.get('minWinRate') || 0);
  const sort = q.get('sort') || 'profit';

  const { matches } = getSeasonData(league, season);
  const allowProfit = profitAllowed(market);
  const byTeam: Record<string, Leg[]> = {};

  (matches as any[]).forEach((m) => {
    [true, false].forEach((isHome) => {
      const team = isHome ? m.HomeTeam : m.AwayTeam;
      const hit = marketHit(m, market, isHome);
      if (hit == null) return;
          const rawOdds = getOddsForMarket(m, market, isHome);
          if (allowProfit && (rawOdds == null || rawOdds < minOdds || rawOdds > maxOdds)) return;
      (byTeam[team] ||= []).push({ odds: allowProfit ? rawOdds : null, hit, date: iso(m.Date) });
    });
  });

    const results = Object.entries(byTeam).map(([team, legs]) => {
    legs.sort((a, b) => a.date.localeCompare(b.date));
    const perf = aggregatePerf(legs, market);
    if (perf.winRate < minWinRate) return null;
    return {
      team, played: perf.n, wins: perf.wins, winRate: perf.winRate,
      avgOdds: perf.avgOdds, totalProfit: perf.profit, roi: perf.roi,
      oddsBasis: perf.oddsBasis,
      lastFive: legs.slice(-5).map((l) => (l.hit ? '✅' : '❌')),
    };
  }).filter(Boolean) as any[];

  results.sort((a, b) =>
    sort === 'winRate' ? b.winRate - a.winRate :
    sort === 'odds' ? (a.avgOdds ?? 99) - (b.avgOdds ?? 99) :
    (b.totalProfit ?? b.wins) - (a.totalProfit ?? a.wins)
  );

  return NextResponse.json({
    results,
    meta: {
      oddsBasis: marketClassification(market),
      exploratory: true,
      note: allowProfit ? null : 'RESULTS ONLY — this market has no bookmaker odds in the dataset; historical profit/ROI is not computed.',
    },
  });
}