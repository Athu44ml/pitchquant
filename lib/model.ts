import { getSeasonData } from './dataProcessor';

export const iso = (d: string) => String(d).split('/').reverse().join('-');
export const MODEL_VERSION = 'xg-poisson-v2-shrunk';
const K = 8;

function poisson(k: number, l: number) {
  let f = 1; for (let i = 2; i <= k; i++) f *= i;
  return (Math.exp(-l) * Math.pow(l, k)) / f;
}

const cache: Record<string, any> = {};

export function strengths(league: string, season: string, beforeDate?: string) {
  const key = `${league}|${season}|${beforeDate || ''}`;
  if (cache[key]) return cache[key];
  const { matches } = getSeasonData(league, season);
  const list = beforeDate ? matches.filter((m: any) => iso(m.Date) < beforeDate) : matches;

  const t: Record<string, any> = {};
  const ensure = (n: string) => (t[n] ||= { hs: 0, hc: 0, hm: 0, as: 0, ac: 0, am: 0 });
  let hg = 0, ag = 0, n = 0, xg = 0, from: string | null = null, to: string | null = null;

  for (const m of list as any[]) {
    const fh = Number(m.FTHG), fa = Number(m.FTAG);
    if (isNaN(fh) || isNaN(fa)) continue;
    const d = iso(m.Date);
    if (!from || d < from) from = d;
    if (!to || d > to) to = d;
    const hasXG = typeof m.HxG === 'number' && typeof m.AxG === 'number';
    const h = hasXG ? m.HxG : fh;
    const a = hasXG ? m.AxG : fa;
    if (hasXG) xg++;
    n++; hg += h; ag += a;
    const H = ensure(m.HomeTeam), A = ensure(m.AwayTeam);
    H.hs += h; H.hc += a; H.hm++;
    A.as += a; A.ac += h; A.am++;
  }

  const lh = n ? hg / n : 1.4;
  const la = n ? ag / n : 1.2;
  const shrink = (raw: number, m: number) => 1 + (m / (m + K)) * (raw - 1);
  const teams: Record<string, any> = {};
  for (const [name, s] of Object.entries(t) as any[]) {
    teams[name] = {
      ah: shrink(s.hm ? s.hs / s.hm / lh : 1, s.hm),
      dh: shrink(s.hm ? s.hc / s.hm / la : 1, s.hm),
      aa: shrink(s.am ? s.as / s.am / la : 1, s.am),
      da: shrink(s.am ? s.ac / s.am / lh : 1, s.am),
      n: s.hm + s.am,
    };
  }
  const out = { teams, lh, la, matches: n, basis: xg > n / 2 ? 'xG' : 'goals', period: { from, to } };
  cache[key] = out;
  return out;
}

export function matchProbs(league: string, season: string, home: string, away: string, beforeDate?: string) {
  const s = strengths(league, season, beforeDate);
  const F = { ah: 1, dh: 1, aa: 1, da: 1, n: 0 };
  const H = s.teams[home] || F;
  const A = s.teams[away] || F;
  const lambda = s.lh * H.ah * A.da;
  const mu = s.la * A.aa * H.dh;

  let pH = 0, pD = 0, pA = 0, pO15 = 0, pO25 = 0, pB = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = poisson(i, lambda) * poisson(j, mu);
    if (i > j) pH += p; else if (i === j) pD += p; else pA += p;
    if (i + j >= 2) pO15 += p;
    if (i + j >= 3) pO25 += p;
    if (i >= 1 && j >= 1) pB += p;
  }
  return {
    version: MODEL_VERSION,
    mode: beforeDate ? 'ROLLING (out-of-sample)' : 'FULL (pre-kickoff, all played matches)',
    preMatch: true,
    trainingPeriod: s.period,
    evidence: Math.min(H.n, A.n),
    lambda: +lambda.toFixed(2), mu: +mu.toFixed(2), basis: s.basis, leagueMatches: s.matches,
    nHome: H.n, nAway: A.n,
    home: pH, draw: pD, away: pA,
    over15: pO15, under15: 1 - pO15, over25: pO25, under25: 1 - pO25, btts: pB,
    winOrDrawHome: pH + pD, winOrDrawAway: pA + pD, noDraw: 1 - pD,
  };
}

export function marketProb(p: any, market: string, side: string): number | null {
  switch (market) {
    case 'win': return side === 'home' ? p.home : side === 'away' ? p.away : side === 'draw' ? p.draw : null;
    case 'over-1.5': return p.over15;
    case 'under-2.5': return p.under25;
    case 'btts': return side === 'no' ? 1 - p.btts : p.btts;
    case 'win-or-draw': return side === 'home' ? p.winOrDrawHome : side === 'away' ? p.winOrDrawAway : null;
    case 'no-draw': return p.noDraw;
    default: return null;
  }
}