import { NextResponse } from 'next/server';
import { getDatasetMeta, oddsBasisFor } from '@/lib/datasets';
import { LEAGUES, SEASONS } from '@/lib/constants';

export async function GET() {
  const out: any[] = [];
  for (const l of LEAGUES) for (const s of SEASONS) {
    const m = getDatasetMeta(l.id, s.id);
    if (!m.file) continue;
    out.push({ ...m, leagueName: l.name, seasonName: s.name });
  }
  const markets = ['win', 'under-2.5', 'over-1.5', 'btts', 'win-or-draw', 'no-draw'].map((mk) => ({ market: mk, oddsBasis: oddsBasisFor(mk) }));
  return NextResponse.json({ datasets: out, markets });
}