import { NextResponse } from 'next/server';
import { getSeasonData, marketHit, getOddsForMarket } from '@/lib/dataProcessor';
import { aggregatePerf, clvFor, Leg } from '@/lib/perf';
import { profitAllowed } from '@/lib/datasets';
import { iso } from '@/lib/model';

type Mode = 'in-sample' | 'out-of-sample' | 'walk-forward';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';
  const market = q.get('market') || 'win';
  const side = q.get('side') || 'home';
  const mode = (q.get('mode') || 'walk-forward') as Mode;
  const minOdds = Number(q.get('minOdds') || 1.01);
  const maxOdds = Number(q.get('maxOdds') || 10);
  const minN = Number(q.get('minN') || 5);
  const minWr = Number(q.get('minWr') || 0);
  const startBank = Number(q.get('startBank') || 1000);
  const stake = 100;

  if (!profitAllowed(market)) {
    return NextResponse.json({ blocked: true, reason: 'Backtest requires real bookmaker odds. This market has none in the dataset (RESULTS ONLY) — historical profit is not computed and no backtest is run.' });
  }

  const { matches } = getSeasonData(league, season);
  const isHomeSide = market === 'win' ? side === 'home' : true;
  const rows = (matches as any[])
    .map((m) => ({
      m, date: iso(m.Date),
      odds: getOddsForMarket(m, market, isHomeSide),
      opening: market === 'win' ? Number(isHomeSide ? m.B365H : m.B365A) : Number(getOddsForMarket(m, market, isHomeSide)),
      closing: market === 'win' ? Number(isHomeSide ? m.B365CH : m.B365CA) : null,
      hit: marketHit(m, market, isHomeSide),
      team: isHomeSide ? m.HomeTeam : m.AwayTeam,
    }))
    .filter((r) => r.odds != null && r.odds >= minOdds && r.odds <= maxOdds && r.hit != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const full: Record<string, { w: number; n: number }> = {};
  for (const r of rows) { const s = (full[r.team] ||= { w: 0, n: 0 }); s.n++; if (r.hit) s.w++; }
  const splitDate = rows[Math.floor(rows.length / 2)]?.date || '';
  const train: Record<string, { w: number; n: number }> = {};
  for (const r of rows) if (r.date < splitDate) { const s = (train[r.team] ||= { w: 0, n: 0 }); s.n++; if (r.hit) s.w++; }

  const rolling: Record<string, { w: number; n: number }> = {};
  const seen = new Set<string>();
  const legs: Leg[] = [];
  const curve: { label: string; bank: number }[] = [];
  const teamProfit: Record<string, { bets: number; profit: number }> = {};
  let bank = startBank;

  for (const r of rows) {
    const fk = `${r.date}|${r.m.HomeTeam}|${r.m.AwayTeam}`;
    const dup = seen.has(fk);
    seen.add(fk);
    const sR = rolling[r.team] || { w: 0, n: 0 };
    const sT = train[r.team] || { w: 0, n: 0 };
    const sF = full[r.team] || { w: 0, n: 0 };
    let ok = false;
    if (!dup) {
      if (mode === 'walk-forward') ok = sR.n >= minN && (sR.n ? (sR.w / sR.n) * 100 : 0) >= minWr;
      else if (mode === 'out-of-sample') ok = r.date >= splitDate && sT.n >= minN && (sT.n ? (sT.w / sT.n) * 100 : 0) >= minWr;
      else ok = sF.n >= minN && (sF.n ? (sF.w / sF.n) * 100 : 0) >= minWr;
      if (ok) {
        legs.push({ odds: r.odds, hit: r.hit, date: r.date, team: r.team, opening: r.opening, closing: r.closing });
        bank += r.hit ? (r.odds! - 1) * stake : -stake;
        curve.push({ label: String(legs.length), bank: Math.round(bank) });
        const tp = (teamProfit[r.team] ||= { bets: 0, profit: 0 });
        tp.bets++; tp.profit += r.hit ? (r.odds! - 1) * stake : -stake;
      }
    }
    const s = (rolling[r.team] ||= { w: 0, n: 0 }); s.n++; if (r.hit) s.w++;
  }

  const metrics = aggregatePerf(legs, market, stake);
  const clvs = legs.map((l) => clvFor(l.opening, l.closing)).filter((x): x is number => x != null);

  return NextResponse.json({
    blocked: false, mode, splitDate,
    metrics: { ...metrics, stake, startBank, endBank: Math.round(bank) },
    curve,
    teamRows: Object.entries(teamProfit).map(([team, d]) => ({ team, ...d, profit: Math.round(d.profit) })).sort((a, b) => b.profit - a.profit),
    clv: {
      n: clvs.length,
      mean: clvs.length ? +(clvs.reduce((a, b) => a + b, 0) / clvs.length).toFixed(2) : null,
      openingAvailable: legs.some((l) => l.opening != null && l.opening! > 1),
      closingAvailable: legs.some((l) => l.closing != null && l.closing! > 1),
    },
    validity: [
      'Chronological processing; each fixture bet at most once (duplicate fixture IDs rejected).',
      mode === 'walk-forward' ? 'WALK-FORWARD (default): qualification uses only matches played before each fixture.' :
      mode === 'out-of-sample' ? `OUT-OF-SAMPLE: trained on matches before ${splitDate}; bets placed only on/after that date.` :
      'IN-SAMPLE: qualification uses full-season statistics — contains look-ahead bias. For comparison only; never cite as evidence.',
      'Bet price = opening (pre-match) bookmaker odds. Closing prices used only for CLV, never for settlement.',
      'CLV is reported separately from ROI; positive CLV does not imply a profitable strategy.',
    ],
  });
}