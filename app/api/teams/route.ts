import { NextResponse } from 'next/server';
import { getSeasonData } from '@/lib/dataProcessor';
import { LEAGUES } from '@/lib/constants';

export async function GET() {
  const teamsByLeague: Record<string, string[]> = {};
  for (const league of LEAGUES) {
    let teams = getSeasonData(league.id, '26').teams;
    if (!teams.length) teams = getSeasonData(league.id, '25').teams;
    if (!teams.length) teams = getSeasonData(league.id, '24').teams;
    teamsByLeague[league.id] = teams;
  }
  return NextResponse.json({ teamsByLeague });
}