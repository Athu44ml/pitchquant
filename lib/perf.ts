import { profitAllowed } from './datasets';

export type Leg = { odds: number | null; hit: boolean; date: string; team?: string; opening?: number | null; closing?: number | null };

export function aggregatePerf(legs: Leg[], market: string, stake = 100) {
  const n = legs.length;
  const wins = legs.filter((l) => l.hit).length;
  const base = { n, wins, losses: n - wins, winRate: n ? +((wins / n) * 100).toFixed(1) : 0 };
  if (!profitAllowed(market)) {
    return { ...base, oddsBasis: 'RESULTS_ONLY' as const, avgOdds: null, profit: null, roi: null, maxDrawdown: null, maxLossStreak: null, maxWinStreak: null, totalStaked: null };
  }
  const wo = legs.filter((l) => l.odds != null) as (Leg & { odds: number })[];
  let bank = 0, peak = 0, maxDD = 0, curL = 0, curW = 0, maxL = 0, maxW = 0, profit = 0;
  for (const l of wo) {
    const pnl = l.hit ? (l.odds - 1) * stake : -stake;
    profit += pnl; bank += pnl;
    if (bank > peak) peak = bank;
    if (peak - bank > maxDD) maxDD = peak - bank;
    if (l.hit) { curW++; curL = 0; } else { curL++; curW = 0; }
    if (curL > maxL) maxL = curL;
    if (curW > maxW) maxW = curW;
  }
  const w = wo.filter((l) => l.hit).length;
  return {
    ...base,
    n: wo.length, wins: w, losses: wo.length - w,
    winRate: wo.length ? +((w / wo.length) * 100).toFixed(1) : 0,
    oddsBasis: 'BOOKMAKER_ODDS' as const,
    avgOdds: wo.length ? +(wo.reduce((s, l) => s + l.odds, 0) / wo.length).toFixed(2) : null,
    profit: Math.round(profit),
    roi: wo.length ? +((profit / (wo.length * stake)) * 100).toFixed(1) : null,
    maxDrawdown: Math.round(maxDD), maxLossStreak: maxL, maxWinStreak: maxW,
    totalStaked: wo.length * stake,
  };
}

export function clvFor(opening: number | null | undefined, closing: number | null | undefined): number | null {
  if (opening == null || closing == null || !(opening > 1) || !(closing > 1)) return null;
  return +(((opening / closing) - 1) * 100).toFixed(2);
}