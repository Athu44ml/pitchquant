import { NextResponse } from 'next/server';
import { getSeasonData, marketHit, getOddsForMarket } from '@/lib/dataProcessor';
import { profitAllowed } from '@/lib/datasets';
import { aggregatePerf, Leg } from '@/lib/perf';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const market = q.get('market') || 'over-1.5';
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';

  const { matches } = getSeasonData(league, season);
  const allowed = profitAllowed(market);

  const byTeam: Record<string, Leg[]> = {};
  (matches as any[]).forEach((m) => {
    [true, false].forEach((isHome) => {
      const team = isHome ? m.HomeTeam : m.AwayTeam;
      const hit = marketHit(m, market, isHome);
            if (typeof hit !== 'boolean') return;
      const odds = allowed ? getOddsForMarket(m, market, isHome) : null;
      (byTeam[team] ||= []).push({ odds, hit, date: String(m.Date) });
    });
  });

  const rows = Object.entries(byTeam).map(([team, legs]) => {
    legs.sort((a, b) => a.date.localeCompare(b.date));
    const p = aggregatePerf(legs, market);
    return { team, played: p.n, wins: p.wins, losses: p.losses, winRate: p.winRate, finalProfit: p.profit, roi: p.roi };
  });

  // Never rank by invented profit: results-only markets sort by sample size first
  rows.sort((a, b) => allowed ? (b.finalProfit ?? 0) - (a.finalProfit ?? 0) : (b.played - a.played) || (b.winRate - a.winRate));

  return NextResponse.json({ leaderboard: rows, oddsBasis: allowed ? 'BOOKMAKER_ODDS' : 'RESULTS_ONLY' });
}