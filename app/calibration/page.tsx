"use client";
import { useEffect, useState } from 'react';
import { LEAGUES, SEASONS } from '@/lib/constants';
import { Readout, MethodologyNote } from '@/components/ui';

const MARKETS = [
  { id: 'win', name: 'Match Winner', hasSide: true },
  { id: 'over-1.5', name: 'Over 1.5 Goals', hasSide: false },
  { id: 'under-2.5', name: 'Under 2.5 Goals', hasSide: false },
  { id: 'btts', name: 'BTTS', hasSide: false },
];

export default function CalibrationPage() {
  const [league, setLeague] = useState('epl');
  const [season, setSeason] = useState('26');
  const [market, setMarket] = useState('over-1.5');
  const [side, setSide] = useState('home');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/calibration?league=${league}&season=${season}&market=${market}&side=${side}`)
      .then((r) => r.json()).then(setData).catch(() => {});
  }, [league, season, market, side]);

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Model Evaluation</p>
          <h1 className="h-title">Calibration</h1>
          <p className="h-desc">Rolling pre-match predictions vs actual outcomes. If the model is honest, actual win rate should track predicted probability per bucket.</p>
        </div>
        {data && <Readout items={[{ k: 'predictions', v: String(data.total) }, { k: 'overall Brier', v: data.overallBrier ?? '—' }]} />}
      </div>

      <div className="ctl mt-5">
        <label className="f"><span>League</span><select value={league} onChange={(e) => setLeague(e.target.value)} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="f"><span>Season</span><select value={season} onChange={(e) => setSeason(e.target.value)} className="select-input">{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="f"><span>Market</span><select value={market} onChange={(e) => setMarket(e.target.value)} className="select-input">{MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        {MARKETS.find((m) => m.id === market)?.hasSide && (
          <label className="f"><span>Side</span><select value={side} onChange={(e) => setSide(e.target.value)} className="select-input"><option value="home">Home</option><option value="away">Away</option></select></label>
        )}
      </div>

      <div className="mod">
        <div className="mod-h"><span className="t">Probability buckets</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Bucket</th><th className="num">N</th><th className="num">Wins</th><th className="num">Actual%</th>
                <th className="num">Avg predicted%</th><th className="num">Diff pp</th><th className="num">Brier</th>
              </tr>
            </thead>
            <tbody>
              {(data?.buckets || []).map((b: any, i: number) => (
                <tr key={i}>
                  <td className="name mono">{b.bucket}</td>
                  <td className="num">{b.n}</td>
                  <td className="num">{b.wins}</td>
                  <td className="num">{b.n ? b.actualPct + '%' : '—'}</td>
                  <td className="num">{b.n ? b.avgPredPct + '%' : '—'}</td>
                  <td className="num">{b.n ? <span className={Math.abs(b.diff) <= 5 ? 'pos' : 'neg'}>{b.diff > 0 ? '+' : ''}{b.diff}</span> : '—'}</td>
                  <td className="num">{b.brier ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MethodologyNote>
          Every prediction is generated using only matches played before the fixture's date — no look-ahead. Brier score: lower is better (0 = perfect). Diff = actual win rate − average predicted probability; |diff| ≤ 5pp is treated as well-calibrated for that bucket.
        </MethodologyNote>
      </div>
    </div>
  );
}