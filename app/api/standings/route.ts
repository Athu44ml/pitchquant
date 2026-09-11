import { NextResponse } from 'next/server';
import { getSeasonData } from '@/lib/dataProcessor';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';

  const { matches } = getSeasonData(league, season);
  const t: Record<string, any> = {};
  const row = (name: string) =>
    (t[name] ||= { team: name, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 });

  (matches as any[]).forEach((m) => {
    const fh = Number(m.FTHG), fa = Number(m.FTAG);
    if (isNaN(fh) || isNaN(fa)) return;
    const H = row(m.HomeTeam), A = row(m.AwayTeam);
    H.P++; A.P++;
    H.GF += fh; H.GA += fa; A.GF += fa; A.GA += fh;
    if (fh > fa) { H.W++; A.L++; H.Pts += 3; }
    else if (fh < fa) { A.W++; H.L++; A.Pts += 3; }
    else { H.D++; A.D++; H.Pts++; A.Pts++; }
  });

  const table = Object.values(t)
    .map((r: any) => ({ ...r, GD: r.GF - r.GA }))
    .sort((a: any, b: any) => b.Pts - a.Pts || b.GD - a.GD || b.GF - a.GF);

  return NextResponse.json({ table });
}