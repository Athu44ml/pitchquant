import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { NextResponse } from 'next/server';

function detectLeague(fileName: string): string | null {
  const n = fileName.toLowerCase();
  if (n.includes('ligue') || n.includes('france') || n.includes('-fr')) return 'france';
  if (n.includes('premier') || n.includes('epl') || n.includes('england') || n.includes('-eng')) return 'epl';
  if (n.includes('laliga') || n.includes('la-liga') || n.includes('spain') || n.includes('-esp')) return 'spain';
  if (n.includes('bundesliga') || n.includes('germany') || n.includes('-ger')) return 'germany';
  if (n.includes('serie') || n.includes('italy') || n.includes('-ita')) return 'italy';
  if (n.includes('eredivisie') || n.includes('nether') || n.includes('-ned')) return 'netherlands';
  if (n.includes('belgium') || n.includes('jupiler') || n.includes('-bel')) return 'belgium';
  if (n.includes('primeira') || n.includes('portugal') || n.includes('-por')) return 'portugal';
  return null;
}

const LEAGUE_NAMES: Record<string, string> = {
  epl: 'Premier League', spain: 'La Liga', germany: 'Bundesliga', italy: 'Serie A',
  france: 'Ligue 1', netherlands: 'Eredivisie', belgium: 'Belgian Pro League', portugal: 'Primeira Liga',
};

const g: any = globalThis;
if (!g.fixturesCache) g.fixturesCache = { data: null as any, time: 0 };

export async function GET() {
  // 60-second cache so dropping new files picks up fast
  if (g.fixturesCache.data && Date.now() - g.fixturesCache.time < 60000) {
    return NextResponse.json(g.fixturesCache.data);
  }

  const dir = path.join(process.cwd(), 'public', 'fixtures');
  const fixtures: any[] = [];
  const errors: string[] = [];

  if (!fs.existsSync(dir)) {
    return NextResponse.json({
      fixtures: [],
      errors: ['public/fixtures folder not found — create it and drop your 8 league fixture CSVs inside.'],
    });
  }

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'));

  for (const file of files) {
    try {
      const league = detectLeague(file);
      if (!league) { errors.push(`${file}: league not recognized from filename`); continue; }

      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });

      (parsed.data as any[]).forEach((row: any, i: number) => {
        const statusRaw = String(row.status || row.Status || '').trim().toLowerCase();
        const resultRaw = String(row.result || row.Result || '').trim();
        const isUpcoming = statusRaw
          ? statusRaw.includes('to be') || statusRaw.includes('scheduled')
          : !resultRaw;
        if (!isUpcoming) return; // skip played matches

        const date = String(row.date || row.Date || '').slice(0, 10);
        const home = String(row.home_team || row.HomeTeam || '').trim();
        const away = String(row.away_team || row.AwayTeam || '').trim();
        if (!date || !home || !away) return;

        fixtures.push({
          id: `fx-${file}-${i}`,
          date,
          time: String(row.time || row.Time || '').slice(0, 5),
          matchday: row.matchday || row.Matchday || '',
          league,
          leagueName: LEAGUE_NAMES[league],
          home,
          away,
          source: 'file',
        });
      });
    } catch (e: any) {
      errors.push(`${file}: ${e?.message || 'parse error'}`);
    }
  }

  fixtures.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  const payload = { fixtures, errors };
  g.fixturesCache = { data: payload, time: Date.now() };
  return NextResponse.json(payload);
}