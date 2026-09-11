import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { NextResponse } from 'next/server';
import { getCachedUpcoming, getCachedBookmakers, getProviderMeta, Quote } from '@/lib/oddsProvider';
import { matchProbs, marketProb, MODEL_VERSION } from '@/lib/model';
import { classifySample } from '@/lib/stats';

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function detectLeague(fileName: string): string | null {
  const n = fileName.toLowerCase();
  if (n.includes('ligue') || n.includes('france') || n.includes('-fr')) return 'france';
  if (n.includes('premier') || n.includes('epl') || n.includes('-eng')) return 'epl';
  if (n.includes('laliga') || n.includes('la-liga') || n.includes('-esp')) return 'spain';
  if (n.includes('bundesliga') || n.includes('-ger')) return 'germany';
  if (n.includes('serie') || n.includes('-ita')) return 'italy';
  if (n.includes('eredivisie') || n.includes('-ned')) return 'netherlands';
  if (n.includes('belgium') || n.includes('jupiler') || n.includes('-bel')) return 'belgium';
  if (n.includes('primeira') || n.includes('-por')) return 'portugal';
  return null;
}

function localUpcoming(league: string) {
  const dir = path.join(process.cwd(), 'public', 'fixtures');
  if (!fs.existsSync(dir)) return [];
  const today = new Date().toISOString().slice(0, 10);
  const out: any[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv'))) {
    if (detectLeague(file) !== league) continue;
    const parsed = Papa.parse(fs.readFileSync(path.join(dir, file), 'utf-8'), { header: true, skipEmptyLines: true });
    for (const r of parsed.data as any[]) {
      const date = String(r.date || '').slice(0, 10);
      if (!date || date < today) continue;
      const status = String(r.status || '').toLowerCase();
      if (status && !status.includes('to be') && !status.includes('scheduled')) continue;
      out.push({ date, time: String(r.time || '').slice(0, 5), home: String(r.home_team || r.HomeTeam || '').trim(), away: String(r.away_team || r.AwayTeam || '').trim() });
    }
  }
  return out.sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
}

function lookupQuotes(pf: any, market: string, side: string, home: string, away: string): Quote[] | null {
  if (!pf) return null;
  if (market === 'win') {
    const sel = side === 'home' ? norm(home) : side === 'away' ? norm(away) : 'draw';
    return (pf.odds?.win?.[sel] as Quote[] | undefined) || null;
  }
  if (market === 'under-2.5') return ((pf.odds?.total?.under || []) as Quote[]).filter((q: Quote) => q.point === 2.5);
  if (market === 'over-1.5') return ((pf.odds?.total?.over || []) as Quote[]).filter((q: Quote) => q.point === 1.5);
  if (market === 'btts') return (pf.odds?.btts?.[side === 'no' ? 'no' : 'yes'] as Quote[] | undefined) || null;
  return null;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';
  const market = q.get('market') || 'win';
  const side = q.get('side') || 'home';
  const team = q.get('team') || '';
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const min = Number(q.get('min') || 1.01);
  const max = Number(q.get('max') || 5);
  const bookmaker = q.get('bookmaker') || '';

  const providerFixtures = await getCachedUpcoming(league);
  const pfMap = new Map(providerFixtures.map((p) => [`${norm(p.home)}|${norm(p.away)}|${p.date}`, p]));
  const pmeta = getProviderMeta();

  const sides = market === 'win' ? (side === 'both' ? ['home', 'away'] : [side]) : [side || 'over'];
  const rows: any[] = [];
  let marketOddsAvailable = false;
  let rangeBasis: 'market' | 'model' = 'market';

  for (const f of localUpcoming(league)) {
    if (from && f.date < from) continue;
    if (to && f.date > to) continue;
    if (team && f.home !== team && f.away !== team) continue;

    const probs = matchProbs(league, season, f.home, f.away);
    const pf = pfMap.get(`${norm(f.home)}|${norm(f.away)}|${f.date}`);

    for (const sd of sides) {
      const prob = marketProb(probs, market, sd);
      if (prob == null || prob <= 0) continue;
      const fair = +(1 / prob).toFixed(2);

      let quotes = lookupQuotes(pf, market, sd, f.home, f.away) || [];
      if (bookmaker) quotes = quotes.filter((x: Quote) => x.bookmaker === bookmaker);
      const best = quotes.length ? quotes.reduce((a, b) => (b.odds > a.odds ? b : a)) : null;
      if (best) marketOddsAvailable = true; else rangeBasis = 'model';

      // Range filter: market odds when present, otherwise model fair odds (disclosed via rangeBasis)
      const filterOdds = best ? best.odds : fair;
      if (filterOdds < min || filterOdds > max) continue;

      const n = Math.min(probs.nHome, probs.nAway);
      const selLabel =
        sd === 'home' ? f.home : sd === 'away' ? f.away :
        sd === 'draw' ? 'Draw' : sd === 'over' ? 'Over 1.5' : sd === 'under' ? 'Under 2.5' :
        sd === 'yes' ? 'BTTS Yes' : sd === 'no' ? 'BTTS No' : 'No Draw';

      rows.push({
        date: f.date, time: f.time, home: f.home, away: f.away, league,
        market, side: sd, selection: selLabel,
        // A) REAL MARKET DATA — null when unavailable, NEVER substituted
        marketOdds: best ? best.odds : null,
        bookmaker: best ? best.bookmaker : null,
        opening: best?.opening ?? null,
        movement: best && best.opening ? +((best.opening - best.odds).toFixed(2)) : null,
        // B) MODEL DATA
        modelP: +(prob * 100).toFixed(1),
        fairOdds: fair,
        modelVersion: MODEL_VERSION,
        // C) DERIVED COMPARISON — null unless real market odds exist
        impliedP: best ? +(100 / best.odds).toFixed(1) : null,
        edgePp: best ? +((prob - 1 / best.odds) * 100).toFixed(1) : null,
        n, confLabel: classifySample(n).label,
      });
    }
  }

  return NextResponse.json({
    rows,
    meta: {
      provider: pmeta.id,
      fetchedAt: pmeta.fetchedAt,
      providerError: pmeta.lastError,
      marketOddsAvailable,
      rangeBasis,
      bookmakers: await getCachedBookmakers(),
      count: rows.length,
    },
  });
}