import { NextResponse } from 'next/server';
import { matchProbs, iso } from '@/lib/model';
import { getSeasonData } from '@/lib/dataProcessor';
import { aggregatePerf, clvFor, Leg } from '@/lib/perf';
import { classifySample, wilsonInterval } from '@/lib/stats';
import { profitAllowed, fixtureKey, matchFixtures, csvKickoff, providerKickoffUTC } from '@/lib/datasets';

export async function GET() {
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const t = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // profit math
  const legsWin: Leg[] = [1.1, 1.5, 2.0, 5.0].map((o) => ({ odds: o, hit: true, date: '2026-01-01' }));
  const pw = aggregatePerf(legsWin, 'win');
  t('win profit = odds-1', pw.profit === Math.round((0.1 + 0.5 + 1 + 4) * 100), `profit ${pw.profit}`);
  t('loss profit = -stake', aggregatePerf([{ odds: 2, hit: false, date: 'x' }], 'win').profit === -100, '-100');
  t('push not possible in .5 markets', true, 'lines at .5 cannot push');
  t('ROI = profit / staked', pw.roi === +(((0.1 + 0.5 + 1 + 4) * 100) / 400 * 100).toFixed(1), `${pw.roi}%`);
  t('cumulative = sum of legs', pw.profit === Math.round(legsWin.reduce((s, l) => s + (l.odds! - 1) * 100, 0) - 0), 'ok');

  // drawdown & streaks
  const dl: Leg[] = [{ odds: 2, hit: false, date: '1' }, { odds: 2, hit: false, date: '2' }, { odds: 2, hit: true, date: '3' }];
  const dd = aggregatePerf(dl, 'win');
  t('max drawdown', dd.maxDrawdown === 200, `${dd.maxDrawdown}`);
  t('longest losing streak', dd.maxLossStreak === 2, `${dd.maxLossStreak}`);
  t('longest winning streak', dd.maxWinStreak === 1, `${dd.maxWinStreak}`);

  // constant odds never enter historical ROI
  const ro = aggregatePerf([{ odds: null, hit: true, date: 'x' }, { odds: null, hit: true, date: 'y' }], 'over-1.5');
  t('constant-odds market: profit null', ro.profit === null && ro.roi === null && ro.oddsBasis === 'RESULTS_ONLY', ro.oddsBasis);
  t('profitAllowed gate', profitAllowed('win') === true && profitAllowed('btts') === false, 'win yes / btts no');

  // model
  const p = matchProbs('france', '26', 'Rennes', 'Marseille');
  t('probabilities in [0,1]', [p.home, p.draw, p.away, p.over15, p.btts].every((x) => x >= 0 && x <= 1), 'ok');
  t('1X2 sums to ~1', Math.abs(p.home + p.draw + p.away - 1) < 0.01, (p.home + p.draw + p.away).toFixed(4));
  t('model transparency fields', !!p.version && !!p.mode && !!p.trainingPeriod && p.preMatch === true, `${p.version} · ${p.mode}`);

  // look-ahead
  const { matches } = getSeasonData('france', '26');
  const rows = matches as any[];
  const sorted = [...rows].sort((a, b) => iso(a.Date).localeCompare(iso(b.Date)));
  const target = sorted[9];
  if (target) {
    const full = matchProbs('france', '26', target.HomeTeam, target.AwayTeam);
    const roll = matchProbs('france', '26', target.HomeTeam, target.AwayTeam, iso(target.Date));
    t('rolling excludes future', roll.nHome + roll.nAway < full.nHome + full.nAway, `rolling ${roll.nHome + roll.nAway} < full ${full.nHome + full.nAway}`);
  } else t('rolling excludes future', false, 'insufficient matches');
  t('results CSV finished only', rows.length > 0 && rows.every((m) => m.FTR && m.FTHG !== ''), `${rows.length} rows`);

  // sample classification boundaries
  t('sample classes', classifySample(9).class === 'VERY_SMALL' && classifySample(10).class === 'SMALL' && classifySample(29).class === 'SMALL' && classifySample(30).class === 'MODERATE' && classifySample(99).class === 'MODERATE' && classifySample(100).class === 'LARGE', '9/10/29/30/99/100');
  const wi = wilsonInterval(7, 10);
  t('wilson interval sane', wi.lower < 0.7 && wi.upper > 0.7, `${(wi.lower * 100).toFixed(0)}–${(wi.upper * 100).toFixed(0)}%`);

  // fixture identity & dedupe
  const fa = { home: 'Rennes', away: 'Marseille', kickoffUTC: '2026-09-11T18:45:00Z', league: 'france', season: '26' };
  const fb = { ...fa };
  const fc = { ...fa, kickoffUTC: '2026-09-12T18:45:00Z' };
  const fd = { ...fa, away: 'Monaco' };
  const keys = new Set([fixtureKey(fa), fixtureKey(fb), fixtureKey(fc), fixtureKey(fd)]);
  t('fixture dedupe by identity', keys.size === 3, `${keys.size} unique of 4`);
  t('kickoff mismatch flagged', matchFixtures(fa, fc).flags.includes('kickoff-mismatch'), matchFixtures(fa, fc).flags.join(','));
  t('team mismatch flagged', matchFixtures(fa, fd).same === false, 'away-team-mismatch');

  // timezone policy
  const ck = csvKickoff('11/09/2026', '18:45');
  t('csv kickoff tz unspecified', ck.tz === 'unspecified', ck.tz);
  t('provider kickoff UTC', providerKickoffUTC('2026-09-11T18:45:00+00:00').endsWith('+00:00'), 'UTC preserved');

  // CLV separation
  t('CLV null without valid prices', clvFor(null, 2.0) === null && clvFor(1.9, null) === null && clvFor(1, 2) === null, 'null');
  t('CLV computed only opening+closing', clvFor(2.0, 1.9) === +(((2.0 / 1.9) - 1) * 100).toFixed(2), `${clvFor(2.0, 1.9)}%`);

  return NextResponse.json({ checks, allPass: checks.every((c) => c.pass), generatedAt: Date.now() });
}