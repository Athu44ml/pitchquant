import { NextResponse } from 'next/server';
import { getSeasonData } from '@/lib/dataProcessor';

const num = (v: any) => (typeof v === 'number' ? v : Number(v) || 0);
const r1 = (x: number) => Number(x.toFixed(1));
const r2 = (x: number) => Number(x.toFixed(2));

function parseDate(d: string) {
  const [dd, mm, yy] = String(d).split('/').map(Number);
  return new Date(yy, mm - 1, dd).getTime();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const tool = searchParams.get('tool') || 'clv';
  const league = searchParams.get('league') || 'epl';
  const season = searchParams.get('season') || '26';

  const { matches } = getSeasonData(league, season);
  if (!matches.length) return NextResponse.json({ rows: [] });

  const byTeam: Record<string, any[]> = {};
  matches.forEach((m: any) => {
    (byTeam[m.HomeTeam] ||= []).push({ m, isHome: true });
    (byTeam[m.AwayTeam] ||= []).push({ m, isHome: false });
  });

  let rows: any[] = [];
  let extra: any = null;

  // 1. CLOSING LINE VALUE
  if (tool === 'clv') {
    rows = Object.entries(byTeam).map(([team, list]) => {
      let sum = 0, n = 0, beat = 0;
      list.forEach(({ m, isHome }) => {
        const open = num(isHome ? m.B365H : m.B365A);
        const close = num(isHome ? m.B365CH : m.B365CA);
        if (open > 1 && close > 1) {
          sum += (open / close - 1) * 100; n++;
          if (open > close) beat++;
        }
      });
      return { team, matches: n, avgClv: n ? r2(sum / n) : 0, beatClosePct: n ? r1((beat / n) * 100) : 0 };
    }).filter((r) => r.matches >= 2).sort((a, b) => b.avgClv - a.avgClv);
  }

  // 2. ODDS BUCKET TRUTH TABLE
  else if (tool === 'truth') {
    const buckets = [[1.01, 1.2], [1.2, 1.4], [1.4, 1.6], [1.6, 1.8], [1.8, 2], [2, 2.5], [2.5, 3], [3, 4], [4, 101]];
    rows = buckets.map(([lo, hi]) => {
      let n = 0, wins = 0, profit = 0, impSum = 0;
      matches.forEach((m: any) => {
        [[num(m.B365H), m.FTR === 'H'], [num(m.B365D), m.FTR === 'D'], [num(m.B365A), m.FTR === 'A']].forEach(([odds, won]: any) => {
          if (odds >= lo && odds < hi) {
            n++; impSum += 100 / odds;
            if (won) { wins++; profit += odds - 1; } else profit -= 1;
          }
        });
      });
      if (!n) return null;
      const hit = (wins / n) * 100, implied = impSum / n;
      return {
        bucket: `${lo.toFixed(2)}–${hi >= 100 ? '∞' : hi.toFixed(2)}`, n, wins,
        hitPct: r1(hit), impliedPct: r1(implied), edge: r1(hit - implied), roi: r1((profit / n) * 100),
      };
    }).filter(Boolean);
  }

  // 3. ASIAN HANDICAP SIMULATOR
  else if (tool === 'ah') {
    rows = Object.entries(byTeam).map(([team, list]) => {
      let cov = 0, pus = 0, los = 0, profit = 0;
      list.forEach(({ m, isHome }) => {
        const line = num(m.AHh);
        const odds = num(isHome ? m.B365AHH : m.B365AHA);
        if (!odds) return;
        const adj = isHome ? num(m.FTHG) + line - num(m.FTAG) : num(m.FTAG) - line - num(m.FTHG);
        if (adj > 0) { cov++; profit += odds - 1; }
        else if (adj === 0) pus++;
        else { los++; profit -= 1; }
      });
      const decided = cov + los;
      return {
        team, covers: cov, pushes: pus, losses: los,
        coverPct: decided ? r1((cov / decided) * 100) : 0,
        profit: Math.round(profit * 100),
        roi: decided ? r1((profit / decided) * 100) : 0,
      };
    }).filter((r) => r.covers + r.pushes + r.losses >= 2).sort((a, b) => b.profit - a.profit);
  }

  // 4. HALF-TIME LAB
  else if (tool === 'ht') {
    rows = Object.entries(byTeam).map(([team, list]) => {
      let leads = 0, hold = 0, blown = 0, o05 = 0, htd = 0;
      list.forEach(({ m, isHome }) => {
        const htr = String(m.HTR), ftr = String(m.FTR);
        const lead = isHome ? htr === 'H' : htr === 'A';
        const ftWin = isHome ? ftr === 'H' : ftr === 'A';
        const ftLoss = isHome ? ftr === 'A' : ftr === 'H';
        if (lead) { leads++; if (ftWin) hold++; if (ftLoss) blown++; }
        if (num(m.HTHG) + num(m.HTAG) >= 1) o05++;
        if (htr === 'D') htd++;
      });
      const n = list.length;
      return {
        team, leads, blown,
        holdPct: leads ? r1((hold / leads) * 100) : 0,
        over05htPct: r1((o05 / n) * 100),
        htDrawPct: r1((htd / n) * 100),
      };
    }).sort((a, b) => b.holdPct - a.holdPct);
  }

  // 5. CORNERS & CARDS LAB
  else if (tool === 'corners') {
    rows = Object.entries(byTeam).map(([team, list]) => {
      let cf = 0, ca = 0, o95 = 0, o105 = 0, cards = 0, o45 = 0;
      list.forEach(({ m, isHome }) => {
        const hc = num(m.HC), ac = num(m.AC);
        cf += isHome ? hc : ac; ca += isHome ? ac : hc;
        const tot = hc + ac;
        if (tot >= 10) o95++;
        if (tot >= 11) o105++;
        const cd = num(m.HY) + num(m.AY);
        cards += cd;
        if (cd >= 5) o45++;
      });
      const n = list.length;
      return {
        team, cf: r1(cf / n), ca: r1(ca / n), totalAvg: r1((cf + ca) / n),
        over95Pct: r1((o95 / n) * 100), over105Pct: r1((o105 / n) * 100),
        cardsAvg: r1(cards / n), over45Pct: r1((o45 / n) * 100),
      };
    }).sort((a, b) => b.totalAvg - a.totalAvg);
  }

  // 6. CONTEXT EDGES (kickoff slots + rest days)
  else if (tool === 'context') {
    const slotDef: any[] = [
      ['12:00–14:59', (h: number) => h < 15],
      ['15:00–17:29', (h: number) => h >= 15 && h < 17.5],
      ['17:30–19:59', (h: number) => h >= 17.5 && h < 20],
      ['20:00+', (h: number) => h >= 20],
    ];
    rows = slotDef.map(([label, test]) => {
      let n = 0, hw = 0, dr = 0, goals = 0, o25 = 0, btts = 0;
      matches.forEach((m: any) => {
        const [hh, mm] = String(m.Time || '0:0').split(':').map(Number);
        if (!test(hh + (mm || 0) / 60)) return;
        n++;
        if (m.FTR === 'H') hw++;
        if (m.FTR === 'D') dr++;
        const g = num(m.FTHG) + num(m.FTAG);
        goals += g;
        if (g >= 3) o25++;
        if (num(m.FTHG) > 0 && num(m.FTAG) > 0) btts++;
      });
      return n ? { slot: label, n, homeWinPct: r1((hw / n) * 100), drawPct: r1((dr / n) * 100), avgGoals: r2(goals / n), over25Pct: r1((o25 / n) * 100), bttsPct: r1((btts / n) * 100) } : null;
    }).filter(Boolean);

    const restDef: any[] = [['≤4 days', 0, 4], ['5–6 days', 5, 6], ['7–8 days', 7, 8], ['9+ days', 9, 999]];
    const agg = restDef.map(([label]) => ({ bucket: label, n: 0, w: 0, gf: 0, ga: 0 }));
    Object.values(byTeam).forEach((list) => {
      const sorted = [...list].sort((a, b) => parseDate(a.m.Date) - parseDate(b.m.Date));
      sorted.forEach((entry, i) => {
        if (i === 0) return;
        const days = Math.round((parseDate(entry.m.Date) - parseDate(sorted[i - 1].m.Date)) / 86400000);
        const idx = restDef.findIndex(([_, lo, hi]) => days >= lo && days <= hi);
        if (idx < 0) return;
        const row = agg[idx];
        row.n++;
        const hg = num(entry.m.FTHG), ag = num(entry.m.FTAG);
        row.gf += entry.isHome ? hg : ag;
        row.ga += entry.isHome ? ag : hg;
        if (entry.isHome ? entry.m.FTR === 'H' : entry.m.FTR === 'A') row.w++;
      });
    });
    extra = agg.filter((r) => r.n).map((r) => ({ bucket: r.bucket, n: r.n, winPct: r1((r.w / r.n) * 100), gf: r2(r.gf / r.n), ga: r2(r.ga / r.n) }));
  }

  // 7. GAME-SCRIPT PROFILES
  else if (tool === 'script') {
    rows = Object.entries(byTeam).map(([team, list]) => {
      let cb = 0, col = 0, leads = 0, h2gf = 0, h2ga = 0;
      list.forEach(({ m, isHome }) => {
        const htr = String(m.HTR), ftr = String(m.FTR);
        const htLead = isHome ? htr === 'H' : htr === 'A';
        const htBehind = isHome ? htr === 'A' : htr === 'H';
        const ftWin = isHome ? ftr === 'H' : ftr === 'A';
        const ftLoss = isHome ? ftr === 'A' : ftr === 'H';
        if (htLead) leads++;
        if (htBehind && ftWin) cb++;
        if (htLead && ftLoss) col++;
        h2gf += isHome ? num(m.FTHG) - num(m.HTHG) : num(m.FTAG) - num(m.HTAG);
        h2ga += isHome ? num(m.FTAG) - num(m.HTAG) : num(m.FTHG) - num(m.HTHG);
      });
      return { team, comebacks: cb, collapses: col, htLeads: leads, h2gf, h2ga };
    }).sort((a, b) => b.comebacks - a.comebacks);
  }

  // 8. LUCK INDEX (xG regression)
  else if (tool === 'luck') {
    let hasXg = false;
    rows = Object.entries(byTeam).map(([team, list]) => {
      let gf = 0, ga = 0, xgf = 0, xga = 0, n = 0;
      list.forEach(({ m, isHome }) => {
        if (typeof m.HxG !== 'number' || typeof m.AxG !== 'number') return;
        hasXg = true; n++;
        const hg = num(m.FTHG), ag = num(m.FTAG);
        gf += isHome ? hg : ag; ga += isHome ? ag : hg;
        xgf += isHome ? m.HxG : m.AxG; xga += isHome ? m.AxG : m.HxG;
      });
      const luck = (gf - ga) - (xgf - xga);
      const per = n ? luck / n : 0;
      return {
        team, n, actDiff: r1(gf - ga), xgDiff: r1(xgf - xga), luck: r1(luck), perMatch: r2(per),
        flag: per >= 0.3 ? '⚠️ LUCKY – FADE' : per <= -0.3 ? '📈 UNLUCKY – BACK' : '➖ FAIR',
      };
    }).filter((r) => r.n >= 2).sort((a, b) => b.perMatch - a.perMatch);
    if (!hasXg) return NextResponse.json({ rows: [], noXg: true });
  }

  return NextResponse.json({ rows, extra });
}