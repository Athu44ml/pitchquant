"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LEAGUES, SEASONS } from '@/lib/constants';
import Crest from '@/components/Crest';
import { Readout, MethodologyNote } from '@/components/ui';

const MARKETS = [
  { id: 'over-1.5', name: 'Over 1.5 Goals' }, { id: 'under-2.5', name: 'Under 2.5 Goals' },
  { id: 'btts', name: 'BTTS (Yes)' }, { id: 'win', name: 'Match Winner' },
  { id: 'win-or-draw', name: 'Win or Draw' }, { id: 'no-draw', name: 'No Draw' },
];

export default function FinderPage() {
  const [league, setLeague] = useState('epl');
  const [season, setSeason] = useState('26');
  const [market, setMarket] = useState('over-1.5');
  const [minOdds, setMinOdds] = useState(1.01);
  const [maxOdds, setMaxOdds] = useState(50);
  const [minWinRate, setMinWinRate] = useState(0);
  const [sort, setSort] = useState('profit');
  const [results, setResults] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let on = true;
    setLoading(true);
    fetch(`/api/finder?league=${league}&season=${season}&market=${market}&minOdds=${minOdds}&maxOdds=${maxOdds}&minWinRate=${minWinRate}&sort=${sort}`)
      .then((r) => r.json()).then((d) => { if (on) { setResults(d.results || []); setMeta(d.meta || null); } })
      .catch(() => {}).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [league, season, market, minOdds, maxOdds, minWinRate, sort]);

  const resultsOnly = meta?.oddsBasis === 'RESULTS_ONLY';
  const profitable = results.filter((r) => r.totalProfit != null && r.totalProfit > 0).length;

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Scanner</p>
          <h1 className="h-title">Pattern Scanner</h1>
          <p className="h-desc">Exploratory historical scan. Click a team to open its Team Lab.</p>
        </div>
        <Readout items={[
          { k: 'match', v: String(results.length) },
          { k: 'profitable', v: resultsOnly ? 'n/a' : String(profitable) },
          { k: 'odds basis', v: resultsOnly ? 'RESULTS ONLY' : 'BOOKMAKER' },
        ]} />
      </div>

      {resultsOnly && (
        <p className="sub mt-3">RESULTS ONLY — this market has no bookmaker odds in the dataset. Hit rates are shown; historical profit, ROI and rankings by profit are not computed.</p>
      )}

      <div className="ctl mt-5">
        <label className="f"><span>League</span><select value={league} onChange={(e) => setLeague(e.target.value)} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="f"><span>Season</span><select value={season} onChange={(e) => setSeason(e.target.value)} className="select-input">{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="f"><span>Market</span><select value={market} onChange={(e) => setMarket(e.target.value)} className="select-input">{MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        <label className="f"><span>Min odds <b className="mono">{minOdds.toFixed(2)}</b></span><input type="range" min="1.01" max="10" step="0.05" value={minOdds} onChange={(e) => setMinOdds(Number(e.target.value))} disabled={resultsOnly} /></label>
        <label className="f"><span>Max odds <b className="mono">{maxOdds.toFixed(1)}</b></span><input type="range" min="1.1" max="50" step="0.1" value={maxOdds} onChange={(e) => setMaxOdds(Number(e.target.value))} disabled={resultsOnly} /></label>
        <label className="f"><span>Min win <b className="mono">{minWinRate}%</b></span><input type="range" min="0" max="100" step="5" value={minWinRate} onChange={(e) => setMinWinRate(Number(e.target.value))} /></label>
        <label className="f"><span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="select-input">
            <option value="profit">{resultsOnly ? 'Wins ↓' : 'Profit ↓'}</option>
            <option value="winRate">Win % ↓</option>
            <option value="odds">Odds ↑</option>
          </select>
        </label>
        {loading && <span className="sub pb-1">scanning…</span>}
      </div>

      <div className="mod">
        <div className="mod-h"><span className="t">Results</span><span className="sub mono">{results.length} rows</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="w-8">#</th><th>Team</th>
                <th className="num">N</th><th className="num">W–L</th><th className="num">Win%</th>
                {!resultsOnly && <><th className="num">Avg odds</th><th className="num">Profit</th><th className="num">ROI</th></>}
                <th>Form</th><th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={9} className="sub" style={{ padding: '24px 10px' }}>No teams match these filters.</td></tr>
              ) : results.map((r, i) => (
                <tr key={r.team}>
                  <td className="mut mono">{i + 1}</td>
                  <td className="name">
                    <Link href={`/team/${encodeURIComponent(r.team)}?league=${league}&season=${season}&market=${market}`} className="flex items-center gap-2 hover:text-[var(--acc)] transition-colors">
                      <Crest name={r.team} size={15} /> {r.team}
                    </Link>
                  </td>
                  <td className="num">{r.played}</td>
                  <td className="num"><span className="pos">{r.wins}</span><span className="mut">–</span><span className="neg">{r.played - r.wins}</span></td>
                  <td className="num">{r.winRate}</td>
                  {!resultsOnly && <>
                    <td className="num">{r.avgOdds != null ? r.avgOdds.toFixed(2) : '—'}</td>
                    <td className={`num ${r.totalProfit >= 0 ? 'pos' : 'neg'}`}>{r.totalProfit != null ? `${r.totalProfit >= 0 ? '+' : '−'}$${Math.abs(r.totalProfit)}` : '—'}</td>
                    <td className={`num ${r.roi >= 0 ? 'pos' : 'neg'}`}>{r.roi != null ? `${r.roi}%` : '—'}</td>
                  </>}
                  <td><span className="flex gap-[3px]">{r.lastFive.map((f: string, j: number) => <span key={j} className={`w-[4px] h-[4px] rounded-[1px] ${f === '✅' ? 'bg-[var(--acc)]' : 'bg-[var(--neg)]'} opacity-70`} />)}</span></td>
                  <td><span className="sub mono">N={r.played}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MethodologyNote>
          Exploratory tool: scanning many team × market × odds combinations will surface impressive-looking patterns by chance alone (multiple testing). Treat outputs as hypotheses for further research, not as evidence of future performance. Minimum sample filtering applies; small samples are never described as strong.
        </MethodologyNote>
      </div>
    </div>
  );
}