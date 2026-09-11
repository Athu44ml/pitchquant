export type SampleClass = 'VERY_SMALL' | 'SMALL' | 'MODERATE' | 'LARGE';

export function classifySample(n: number): { class: SampleClass; label: string } {
  if (n < 10) return { class: 'VERY_SMALL', label: 'Very small sample' };
  if (n < 30) return { class: 'SMALL', label: 'Small sample' };
  if (n < 100) return { class: 'MODERATE', label: 'Moderate sample' };
  return { class: 'LARGE', label: 'Large sample' };
}

export function wilsonInterval(wins: number, n: number, z = 1.96): { lower: number; upper: number } {
  if (n === 0) return { lower: 0, upper: 0 };
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = (z / d) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lower: Math.max(0, (c - m) / d), upper: Math.min(1, (c + m) / d) };
}

export function calcEdge(winRate: number, avgOdds: number): { breakEven: number; edge: number } {
  if (avgOdds <= 1) return { breakEven: 100, edge: 0 };
  return { breakEven: (1 / avgOdds) * 100, edge: (winRate - 1 / avgOdds) * 100 };
}

export function formatPct(v: number, decimals = 1): string { return `${(v * 100).toFixed(decimals)}%`; }
export function brier(p: number, hit: boolean): number { const y = hit ? 1 : 0; return (p - y) * (p - y); }
export function logLoss(p: number, hit: boolean): number {
  const c = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  return -(hit ? Math.log(c) : Math.log(1 - c));
}