"use client";
import { useEffect, useState } from 'react';
import { LEAGUES } from '@/lib/constants';
import { Readout, MethodologyNote } from '@/components/ui';
import Crest from '@/components/Crest';

const MARKETS = [
  { id: 'win', name: 'Match Winner', sides: ['home', 'draw', 'away', 'both'] },
  { id: 'over-1.5', name: 'Over 1.5 Goals', sides: ['over'] },
  { id: 'under-2.5', name: 'Under 2.5 Goals', sides: ['under'] },
  { id: 'btts', name: 'BTTS', sides: ['yes', 'no'] },
  { id: 'win-or-draw', name: 'Win or Draw', sides: ['home', 'away'] },
  { id: 'no-draw', name: 'No Draw', sides: ['nodraw'] },
];

function ago(ts: number): string {
  if (!ts) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)}h ago`;
}

export default function FindOddsPage() {
  const [league, setLeague] = useState('epl');
  const [market, setMarket] = useState('win');
  const [side, setSide] = useState('both');
  const [team, setTeam] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [min, setMin] = useState(1.01);
  const [max, setMax] = useState(5);
  const [bookmaker, setBookmaker] = useState('');
  const [teams, setTeams] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/teams').then((r) => r.json()).then((d) => setTeams(d.teamsByLeague?.[league] || [])).catch(() => {});
  }, [league]);

  useEffect(() => {
    let on = true;
    setLoading(true);
    const q = `league=${league}&market=${market}&side=${side}&team=${encodeURIComponent(team)}&from=${from}&to=${to}&min=${min}&max=${max}&bookmaker=${encodeURIComponent(bookmaker)}`;
    fetch(`/api/find-odds?${q}`).then((r) => r.json()).then((d) => {
      if (!on) return;
      setRows(d.rows || []); setMeta(d.meta || null);
    }).catch(() => {}).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [league, market, side, team, from, to, min, max, bookmaker]);

  const mkt = MARKETS.find((m) => m.id === market)!;
  const stale = meta?.fetchedAt && Date.now() - meta.fetchedAt > 15 * 60 * 1000;

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Market Research</p>
          <h1 className="h-title">Find Your Odds</h1>
          <p className="h-desc">Upcoming fixtures with real bookmaker prices (when available) beside the internal model's probability and fair odds. Research tool — not a prediction service.</p>
        </div>
        {meta && (
          <Readout items={[
            { k: 'rows', v: String(rows.length) },
            { k: 'provider', v: meta.provider },
            { k: 'market odds', v: meta.marketOddsAvailable ? 'available' : 'unavailable', tone: meta.marketOddsAvailable ? 'pos' : undefined },
            { k: 'updated', v: ago(meta.fetchedAt) },
          ]} />
        )}
      </div>

      <div className="ctl mt-5">
        <label className="f"><span>League</span>
          <select value={league} onChange={(e) => { setLeague(e.target.value); setTeam(''); }} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        </label>
        <label className="f"><span>Market</span>
          <select value={market} onChange={(e) => { setMarket(e.target.value); setSide(e.target.value === 'win' ? 'both' : 'over'); }} className="select-input">{MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </label>
        {mkt.sides.length > 1 && (
          <label className="f"><span>Selection</span>
            <select value={side} onChange={(e) => setSide(e.target.value)} className="select-input">{mkt.sides.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </label>
        )}
        <label className="f"><span>Team</span>
          <select value={team} onChange={(e) => setTeam(e.target.value)} className="select-input"><option value="">All teams</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
        </label>
        <label className="f"><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="select-input" /></label>
        <label className="f"><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="select-input" /></label>
        <label className="f"><span>Min odds <b className="mono">{min.toFixed(2)}</b></span>
          <input type="range" min="1.01" max="5" step="0.05" value={min} onChange={(e) => setMin(Number(e.target.value))} />
        </label>
        <label className="f"><span>Max odds <b className="mono">{max.toFixed(2)}</b></span>
          <input type="range" min="1.1" max="20" step="0.1" value={max} onChange={(e) => setMax(Number(e.target.value))} />
        </label>
        <label className="f"><span>Bookmaker</span>
          <select value={bookmaker} onChange={(e) => setBookmaker(e.target.value)} className="select-input" disabled={!meta?.bookmakers?.length}>
            <option value="">{meta?.bookmakers?.length ? 'Best price' : 'No provider'}</option>
            {(meta?.bookmakers || []).map((b: string) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
        <span className="sub pb-1">pre-match only</span>
        {loading && <span className="sub pb-1">loading…</span>}
      </div>

      {meta?.providerError && (
        <p className="neg text-[11px] mt-3">Provider error: {meta.providerError === 'rate_limited' ? 'rate limit reached — odds may be stale' : meta.providerError}. Showing model data only.</p>
      )}
      {stale && <p className="neg text-[11px] mt-1">Odds may be stale (last update {ago(meta.fetchedAt)}).</p>}
      {meta && meta.provider === 'local' && (
        <p className="sub mt-3">No odds provider connected (set FIVE_DOLLAR_API_KEY server-side). Market odds columns show "—"; model probability and fair odds remain visible separately.</p>
      )}
      {meta && meta.provider !== 'local' && !meta.marketOddsAvailable && rows.length > 0 && (
        <p className="sub mt-3">Market odds unavailable for these fixtures (provider coverage window or plan). Model fair odds are shown separately and are NOT bookmaker prices.</p>
      )}
      {meta && !meta.marketOddsAvailable && meta.rangeBasis === 'model' && (
        <p className="sub mt-1">Odds-range filter currently applies to model fair odds.</p>
      )}

      <div className="mod">
        <div className="mod-h"><span className="t">Fixtures · {mkt.name}</span><span className="sub mono">{rows.length} rows</span></div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Kickoff</th><th>Match</th><th>Selection</th>
                <th className="num">Mkt odds</th><th>Book</th><th className="num">Open</th><th className="num">Move</th>
                <th className="num">Model p</th><th className="num">Fair</th>
                <th className="num">Implied</th><th className="num">Edge pp</th><th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={12} className="sub" style={{ padding: '24px 10px' }}>No fixtures match these filters.</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i}>
                  <td className="mut mono">{r.date} {r.time}</td>
                  <td className="name"><span className="flex items-center gap-2"><Crest name={r.home} size={14} />{r.home} <span className="mut">v</span> <Crest name={r.away} size={14} />{r.away}</span></td>
                  <td>{r.selection}</td>
                  <td className="num" title={r.marketOdds == null ? 'Market odds unavailable' : undefined}>{r.marketOdds != null ? r.marketOdds.toFixed(2) : '—'}</td>
                  <td className="mut">{r.bookmaker || '—'}</td>
                  <td className="num">{r.opening != null ? r.opening.toFixed(2) : '—'}</td>
                  <td className="num">{r.movement != null ? <span className={r.movement < 0 ? 'pos' : 'neg'}>{r.movement > 0 ? '+' : ''}{r.movement}</span> : '—'}</td>
                  <td className="num">{r.modelP}%</td>
                  <td className="num">{r.fairOdds.toFixed(2)}</td>
                  <td className="num">{r.impliedP != null ? r.impliedP + '%' : '—'}</td>
                  <td className="num">{r.edgePp != null ? <span className={r.edgePp >= 0 ? 'pos' : 'neg'}>{r.edgePp > 0 ? '+' : ''}{r.edgePp}</span> : '—'}</td>
                  <td><span className="sub mono">N={r.n} · {r.confLabel}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MethodologyNote>
          Model {rows[0]?.modelVersion || ''} — xG/goals strength ratings with empirical-Bayes shrinkage, rolling pre-match data only. Fair odds = 1 / model probability and are NOT bookmaker prices. Edge = model probability − market implied probability; it does not account for bookmaker margin or model uncertainty and is not a claim of profitable bets.
        </MethodologyNote>
        {meta?.provider === '5dollarfootball' && (
          <p className="sub mt-2">Football data by <a className="pos" href="https://5dollarfootballapi.com" target="_blank" rel="noopener">5DollarFootballAPI</a></p>
        )}
      </div>
    </div>
  );
}