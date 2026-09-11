import { NextResponse } from 'next/server';
import { getSeasonData } from '@/lib/dataProcessor';

const sortKey = (d: string) => d.split('/').reverse().join('-');

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const league = searchParams.get('league') || 'epl';
  const home = searchParams.get('home') || '';
  const away = searchParams.get('away') || '';
  if (!home || !away) return NextResponse.json({ meetings: [] });

  const meetings: any[] = [];
  for (const s of ['26', '25', '24', '23', '22']) {
    const { matches } = getSeasonData(league, s);
    matches.forEach((m: any) => {
      const hit = (m.HomeTeam === home && m.AwayTeam === away) || (m.HomeTeam === away && m.AwayTeam === home);
      if (!hit) return;
      const hg = Number(m.FTHG), ag = Number(m.FTAG);
      if (isNaN(hg) || isNaN(ag)) return;
      meetings.push({ season: s, date: String(m.Date), home: m.HomeTeam, away: m.AwayTeam, hg, ag });
    });
    if (meetings.length >= 6) break;
  }
  meetings.sort((a, b) => sortKey(b.date).localeCompare(sortKey(a.date)));
  return NextResponse.json({ meetings: meetings.slice(0, 6) });
}