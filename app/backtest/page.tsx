"use client";
import { useEffect, useState } from 'react';
import { LEAGUES, SEASONS } from '@/lib/constants';
import { Metrics, Mod, Readout, MethodologyNote } from '@/components/ui';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

const MARKETS = [
  { id: 'win', name: 'Match Winner', hasSide: true },
  { id: 'under-2.5', name: 'Under 2.5 Goals', hasSide: false },
  { id: 'over-1.5', name: 'Over 1.5 Goals', hasSide: false },
  { id: 'btts', name: 'BTTS', hasSide: false },
];

export default function BacktestPage() {
  const [league, setLeague] = useState('epl');
  const [season, setSeason] = useState('26');
  const [market, setMarket] = useState('win');
  const [side, setSide] = useState('home');
  const [mode, setMode] = useState<'walk-forward' | 'out-of-sample' | 'in-sample'>('walk-forward');
  const [minOdds, setMinOdds] = useState(1.01);
  const [maxOdds, setMaxOdds] = useState(10);
  const [minN, setMinN] = useState(5);
  const [minWr, setMinWr] = useState(0);
  const [res, setRes] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/backtest?league=${league}&season=${season}&market=${market}&side=${side}&mode=${mode}&minOdds=${minOdds}&maxOdds=${maxOdds}&minN=${minN}&minWr=${minWr}`)
      .then((r) => r.json()).then(setRes).catch(() => {});
  }, [league, season, market, side, mode, minOdds, maxOdds, minN, minWr]);

  const m = res?.metrics;

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Research</p>
          <h1 className="h-title">Backtest Lab</h1>
          <p className="h-desc">Chronological strategy simulation on real bookmaker odds. Walk-forward is the default evaluation mode.</p>
        </div>
        {m && <Readout items={[{ k: 'mode', v: res.mode }, { k: 'bets', v: String(m.n) }, { k: 'roi', v: m.roi != null ? m.roi + '%' : '—', tone: m.roi > 0 ? 'pos' : m.roi < 0 ? 'neg' : undefined }]} />}
      </div>

      <div className="ctl mt-5">
        <label className="f"><span>League</span><select value={league} onChange={(e) => setLeague(e.target.value)} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="f"><span>Season</span><select value={season} onChange={(e) => setSeason(e.target.value)} className="select-input">{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="f"><span>Market</span><select value={market} onChange={(e) => setMarket(e.target.value)} className="select-input">{MARKETS.map((mk) => <option key={mk.id} value={mk.id}>{mk.name}</option>)}</select></label>
        {MARKETS.find((mk) => mk.id === market)?.hasSide && (
          <label className="f"><span>Side</span><select value={side} onChange={(e) => setSide(e.target.value)} className="select-input"><option value="home">Home</option><option value="away">Away</option></select></label>
        )}
        <label className="f"><span>Evaluation mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="select-input">
            <option value="walk-forward">WALK-FORWARD (preferred)</option>
            <option value="out-of-sample">OUT-OF-SAMPLE</option>
            <option value="in-sample">IN-SAMPLE (look-ahead, comparison only)</option>
          </select>
        </label>
        <label className="f"><span>Min odds <b className="mono">{minOdds.toFixed(2)}</b></span><input type="range" min="1.01" max="5" step="0.05" value={minOdds} onChange={(e) => setMinOdds(Number(e.target.value))} /></label>
        <label className="f"><span>Max odds <b className="mono">{maxOdds.toFixed(1)}</b></span><input type="range" min="1.1" max="20" step="0.1" value={maxOdds} onChange={(e) => setMaxOdds(Number(e.target.value))} /></label>
        <label className="f"><span>Min sample <b className="mono">{minN}</b></span><input type="range" min="0" max="20" value={minN} onChange={(e) => setMinN(Number(e.target.value))} /></label>
        <label className="f"><span>Min rolling win <b className="mono">{minWr}%</b></span><input type="range" min="0" max="100" step="5" value={minWr} onChange={(e) => setMinWr(Number(e.target.value))} /></label>
      </div>

      {mode === 'in-sample' && <p className="neg text-[11px] mt-2">IN-SAMPLE mode uses full-season statistics for qualification — it contains look-ahead bias. Never cite these numbers as evidence.</p>}

      {res?.blocked ? (
        <div className="mod">
          <p className="sub">{res.reason}</p>
          <p className="sub mt-1">Switch to Match Winner or Under 2.5 to run a bookmaker-odds backtest.</p>
        </div>
      ) : m && (
        <>
          <div className="mt-6">
            <Metrics items={[
              { label: 'Bets', value: String(m.n) },
              { label: 'Total staked', value: m.totalStaked != null ? `$${m.totalStaked}` : '—' },
              { label: 'Net profit', value: m.profit != null ? `${m.profit >= 0 ? '+' : '−'}$${Math.abs(m.profit)}` : '—', tone: m.profit > 0 ? 'pos' : m.profit < 0 ? 'neg' : undefined },
              { label: 'ROI', value: m.roi != null ? `${m.roi}%` : '—', tone: m.roi > 0 ? 'pos' : m.roi < 0 ? 'neg' : undefined },
              { label: 'Hit rate', value: `${m.winRate}%` },
              { label: 'Avg odds', value: m.avgOdds != null ? m.avgOdds.toFixed(2) : '—' },
              { label: 'Max drawdown', value: m.maxDrawdown != null ? `$${m.maxDrawdown}` : '—', tone: 'neg' },
              { label: 'Losing streak', value: String(m.maxLossStreak ?? '—') },
              { label: 'Winning streak', value: String(m.maxWinStreak ?? '—') },
              { label: 'End bank', value: `$${res.metrics.endBank}`, sub: `start $${m.startBank}` },
            ]} />
          </div>

          <Mod title="EQUITY CURVE">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={res.curve} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#5C6670', fontFamily: 'var(--mono)' }} stroke="rgba(255,255,255,0.1)" tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#5C6670', fontFamily: 'var(--mono)' }} stroke="rgba(255,255,255,0.1)" tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#0F1521', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, fontSize: 11, fontFamily: 'var(--mono)', color: '#D6DBE1' }} formatter={(v: any) => [`$${v}`, 'bank']} />
                  <ReferenceLine y={m.startBank} stroke="rgba(255,255,255,0.14)" />
                  <Line type="monotone" dataKey="bank" stroke="var(--acc)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Mod>

          <Mod title="CLV (SEPARATE FROM ROI)">
            <Readout items={[
              { k: 'mean CLV', v: res.clv?.mean != null ? `${res.clv.mean > 0 ? '+' : ''}${res.clv.mean}%` : 'Unavailable' },
              { k: 'pairs', v: String(res.clv?.n || 0) },
              { k: 'opening prices', v: res.clv?.openingAvailable ? 'available' : 'Unavailable' },
              { k: 'closing prices', v: res.clv?.closingAvailable ? 'available' : 'Unavailable' },
            ]} />
            <p className="sub mt-2">CLV measures price movement only. It is not profit and does not imply a profitable strategy.</p>
          </Mod>

          <Mod title="TEAM CONTRIBUTION">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Team</th><th className="num">Bets</th><th className="num">P/L</th></tr></thead>
                <tbody>
                  {(res.teamRows || []).slice(0, 10).map((t: any, i: number) => (
                    <tr key={i}><td className="name">{t.team}</td><td className="num">{t.bets}</td><td className={`num ${t.profit >= 0 ? 'pos' : 'neg'}`}>{t.profit >= 0 ? '+' : '−'}${Math.abs(t.profit)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Mod>

          <Mod title="BACKTEST VALIDITY">
            <ul className="sub space-y-1 list-disc pl-4">{(res.validity || []).map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
          </Mod>
        </>
      )}
      <MethodologyNote>Historical qualification uses only information available before each match. ROI = net profit ÷ total staked (distinct from bankroll growth and from cumulative profit).</MethodologyNote>
    </div>
  );
}