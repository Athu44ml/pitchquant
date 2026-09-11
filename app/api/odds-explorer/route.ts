import { NextResponse } from 'next/server';
import { getSeasonData, marketHit, getOddsForMarket } from '@/lib/dataProcessor';
import { matchProbs, marketProb, iso } from '@/lib/model';
import { classifySample } from '@/lib/stats';
import { profitAllowed } from '@/lib/datasets';
import { aggregatePerf, clvFor, Leg } from '@/lib/perf';

const FIXED: [string, number, number][] = [
  ['1.01–1.10', 1.01, 1.1], ['1.10–1.20', 1.1, 1.2], ['1.20–1.30', 1.2, 1.3],
  ['1.30–1.50', 1.3, 1.5], ['1.50–2.00', 1.5, 2], ['2.00–3.00', 2, 3],
  ['3.00–5.00', 3, 5], ['5.00+', 5, 1000],
];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';
  const market = q.get('market') || 'win';
  const side = q.get('side') || 'home';
  const cmin = q.get('min') ? Number(q.get('min')) : null;
  const cmax = q.get('max') ? Number(q.get('max')) : null;

  if (!profitAllowed(market)) {
    return NextResponse.json({ blocked: true, oddsBasis: 'RESULTS_ONLY', reason: 'Odds Range Explorer requires genuine historical bookmaker odds. This market has none in the dataset (RESULTS ONLY) — no odds buckets, profit, ROI or drawdown are computed for it.' });
  }

  const { matches } = getSeasonData(league, season);
  const isHomeSide = market === 'win' ? side === 'home' : true;

  const rows = (matches as any[])
    .map((m) => {
      const odds = getOddsForMarket(m, market, isHomeSide);
      const hit = marketHit(m, market, isHomeSide);
      const p = matchProbs(league, season, m.HomeTeam, m.AwayTeam, iso(m.Date));
      const mp = marketProb(p, market, market === 'win' ? side : 'over');
      const opening = market === 'win' ? Number(isHomeSide ? m.B365H : m.B365A) : odds;
      const closing = market === 'win' ? Number(isHomeSide ? m.B365CH : m.B365CA) : null;
      return { odds, hit, date: iso(m.Date), mp: mp || 0, opening, closing, implied: odds > 1 ? 1 / odds : 0 };
    })
    .filter((r) => r.odds != null && r.odds > 1 && typeof r.hit === 'boolean');

  const buckets = (cmin != null && cmax != null ? [['custom', cmin, cmax]] : FIXED) as [string, number, number][];

  const out = buckets.map(([label, lo, hi]) => {
    const list: (Leg & { mp: number; implied: number; opening: number | null; closing: number | null })[] =
      rows.filter((r) => r.odds! >= lo && r.odds! < hi);
    const perf = aggregatePerf(list, market);
    const n = list.length;
    const clvs = list.map((r) => clvFor(r.opening, r.closing)).filter((x): x is number => x != null);
    return {
      range: label, n, wins: perf.wins, losses: perf.losses, winPct: perf.winRate,
      avgOdds: perf.avgOdds ?? 0, profit: perf.profit, roi: perf.roi, maxDD: perf.maxDrawdown ?? 0,
      modelP: n ? +((list.reduce((s, r) => s + r.mp, 0) / n) * 100).toFixed(1) : 0,
      impliedP: n ? +((list.reduce((s, r) => s + r.implied, 0) / n) * 100).toFixed(1) : 0,
      clv: clvs.length ? +(clvs.reduce((a, b) => a + b, 0) / clvs.length).toFixed(2) : null,
      confidence: classifySample(n).label,
    };
  });

  return NextResponse.json({ buckets: out, market, side, oddsBasis: 'BOOKMAKER_ODDS' });
}