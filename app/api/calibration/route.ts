import { NextResponse } from 'next/server';
import { getSeasonData, marketHit, getOddsForMarket } from '@/lib/dataProcessor';
import { matchProbs, marketProb, iso } from '@/lib/model';
import { brier, logLoss } from '@/lib/stats';
import { profitAllowed } from '@/lib/datasets';

const BUCKETS: [string, number, number][] = [
  ['0–50%', 0, 0.5], ['50–55%', 0.5, 0.55], ['55–60%', 0.55, 0.6], ['60–65%', 0.6, 0.65],
  ['65–70%', 0.65, 0.7], ['70–75%', 0.7, 0.75], ['75–80%', 0.75, 0.8],
  ['80–85%', 0.8, 0.85], ['85–90%', 0.85, 0.9], ['90%+', 0.9, 1.01],
];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';
  const market = q.get('market') || 'over-1.5';
  const side = q.get('side') || 'home';

  const { matches } = getSeasonData(league, season);
  const isHomeSide = market === 'win' ? side === 'home' : true;
  const sorted = [...(matches as any[])].sort((a, b) => iso(a.Date).localeCompare(iso(b.Date)));

  const model: { p: number; hit: boolean }[] = [];
  const base: { p: number; hit: boolean }[] = [];
  const book: { p: number; hit: boolean }[] = [];
  let gW = 0, gN = 0;

  for (const m of sorted) {
    const hit = marketHit(m, market, isHomeSide);
    if (hit == null) continue;
    const p = matchProbs(league, season, m.HomeTeam, m.AwayTeam, iso(m.Date));
    const mp = marketProb(p, market, market === 'win' ? side : 'over');
    if (mp != null) model.push({ p: mp, hit });
    if (gN > 0) base.push({ p: gW / gN, hit });
    if (profitAllowed(market)) {
      const open = getOddsForMarket(m, market, isHomeSide);
      if (open > 1) book.push({ p: 1 / open, hit });
    }
    gN++; if (hit) gW++;
  }

  const score = (arr: { p: number; hit: boolean }[]) => arr.length ? {
    n: arr.length,
    brier: +(arr.reduce((s, x) => s + brier(x.p, x.hit), 0) / arr.length).toFixed(4),
    logLoss: +(arr.reduce((s, x) => s + logLoss(x.p, x.hit), 0) / arr.length).toFixed(4),
  } : { n: 0, brier: null, logLoss: null };

  const buckets = BUCKETS.map(([label, lo, hi]) => {
    const list = model.filter((x) => x.p >= lo && x.p < hi);
    const n = list.length;
    const wins = list.filter((x) => x.hit).length;
    const avgP = n ? list.reduce((s, x) => s + x.p, 0) / n : 0;
    const actual = n ? wins / n : 0;
    return {
      bucket: label, n, wins,
      actualPct: n ? +((actual) * 100).toFixed(1) : 0,
      avgPredPct: +((avgP) * 100).toFixed(1),
      diff: n ? +((actual - avgP) * 100).toFixed(1) : 0,
      brier: n ? +(list.reduce((s, x) => s + brier(x.p, x.hit), 0) / n).toFixed(4) : null,
    };
  });

  return NextResponse.json({
    buckets, total: model.length,
    overallBrier: score(model).brier, overallLogLoss: score(model).logLoss,
    benchmarks: [
      { name: 'Model (walk-forward)', ...score(model) },
      { name: 'League base rate (rolling)', ...score(base) },
      { name: 'Bookmaker implied (opening, raw)', ...score(book) },
    ],
    note: 'Bookmaker implied probabilities are raw 1/odds (margin not removed). Lower Brier/log-loss is better. No claim is made that the model beats bookmakers.',
  });
}