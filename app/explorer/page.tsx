"use client";
import { useEffect, useState } from 'react';
import { LEAGUES, SEASONS } from '@/lib/constants';
import { MethodologyNote } from '@/components/ui';

const MARKETS = [
  { id: 'win', name: 'Match Winner', hasSide: true },
  { id: 'under-2.5', name: 'Under 2.5 Goals', hasSide: false },
  { id: 'over-1.5', name: 'Over 1.5 Goals', hasSide: false },
  { id: 'btts', name: 'BTTS', hasSide: false },
  { id: 'win-or-draw', name: 'Win or Draw', hasSide: false },
  { id: 'no-draw', name: 'No Draw', hasSide: false },
];

export default function ExplorerPage() {
  const [league, setLeague] = useState('epl');
  const [season, setSeason] = useState('26');
  const [market, setMarket] = useState('win');
  const [side, setSide] = useState('home');
  const [cmin, setCmin] = useState('');
  const [cmax, setCmax] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const q = `league=${league}&season=${season}&market=${market}&side=${side}${cmin && cmax ? `&min=${cmin}&max=${cmax}` : ''}`;
    fetch(`/api/odds-explorer?${q}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [league, season, market, side, cmin, cmax]);

  return (
    <div className="page">
      <p className="eyebrow mb-1">Market Research</p>
      <h1 className="h-title">Odds Range Explorer</h1>
      <p className="h-desc">Historical performance of a market inside odds bands. Model probabilities are rolling (pre-match knowledge only).</p>

      <div className="ctl mt-5">
        <label className="f"><span>League</span><select value={league} onChange={(e) => setLeague(e.target.value)} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="f"><span>Season</span><select value={season} onChange={(e) => setSeason(e.target.value)} className="select-input">{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="f"><span>Market</span><select value={market} onChange={(e) => setMarket(e.target.value)} className="select-input">{MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        {MARKETS.find((m) => m.id === market)?.hasSide && (
          <label className="f"><span>Side</span><select value={side} onChange={(e) => setSide(e.target.value)} className="select-input"><option value="home">Home</option><option value="away">Away</option></select></label>
        )}
        <label className="f"><span>Custom min</span><input value={cmin} onChange={(e) => setCmin(e.target.value)} placeholder="e.g. 1.20" className="select-input mono" /></label>
        <label className="f"><span>Custom max</span><input value={cmax} onChange={(e) => setCmax(e.target.value)} placeholder="e.g. 1.60" className="select-input mono" /></label>
      </div>

      {data?.blocked ? (
        <div className="mod">
          <p className="sub">{data.reason}</p>
          <p className="sub mt-1">Switch to Match Winner or Under 2.5 to explore genuine bookmaker-odds ranges.</p>
        </div>
      ) : (
        <div className="mod">
          <div className="mod-h"><span className="t">Buckets</span><span className="sub mono">{cmin && cmax ? 'custom range' : 'fixed ranges'}</span></div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Range</th><th className="num">N</th><th className="num">W</th><th className="num">L</th><th className="num">Win%</th>
                  <th className="num">Avg odds</th><th className="num">Profit</th><th className="num">ROI</th><th className="num">MaxDD</th>
                  <th className="num">Model p</th><th className="num">Implied p</th><th className="num">CLV</th><th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {(data?.buckets || []).map((b: any, i: number) => (
                  <tr key={i}>
                    <td className="name mono">{b.range}</td>
                    <td className="num">{b.n}</td>
                    <td className="num">{b.wins}</td>
                    <td className="num">{b.losses}</td>
                    <td className="num">{b.n ? b.winPct + '%' : '—'}</td>
                    <td className="num">{b.avgOdds ? b.avgOdds.toFixed(2) : '—'}</td>
                    <td className={`num ${(b.profit ?? 0) >= 0 ? 'pos' : 'neg'}`}>{b.profit != null ? `${b.profit >= 0 ? '+' : '−'}$${Math.abs(b.profit)}` : '—'}</td>
                    <td className={`num ${(b.roi ?? 0) >= 0 ? 'pos' : 'neg'}`}>{b.roi != null ? b.roi + '%' : '—'}</td>
                    <td className="num neg">{b.n ? b.maxDD.toFixed(0) : '—'}</td>
                    <td className="num">{b.n ? b.modelP + '%' : '—'}</td>
                    <td className="num">{b.n ? b.impliedP + '%' : '—'}</td>
                    <td className="num">{b.clv != null ? <span className={b.clv >= 0 ? 'pos' : 'neg'}>{b.clv > 0 ? '+' : ''}{b.clv}</span> : '—'}</td>
                    <td><span className={`sub ${b.n < 30 ? 'neg' : 'mut'}`}>{b.confidence}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <MethodologyNote>
            Sequential simulation, $100 flat stake. Model probabilities use only matches played before each fixture. Buckets with N &lt; 30 are flagged — small samples are not statistically meaningful regardless of win rate.
          </MethodologyNote>
        </div>
      )}
    </div>
  );
}