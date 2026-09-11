"use client";
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { LEAGUES, SEASONS } from '@/lib/constants';
import Crest from '@/components/Crest';
import { Metrics } from '@/components/ui';

function Inner() {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();
  const marketName = (params.marketName as string) || 'over-1.5';

  const league = sp.get('league') || 'epl';
  const season = sp.get('season') || '26';
  const teamParam = sp.get('team') || '';

  const [teams, setTeams] = useState<string[]>([]);
  const [graphData, setGraphData] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [stats, setStats] = useState<{ totalStaked: number | null; finalProfit: number | null; roi: string | null }>({ totalStaked: null, finalProfit: null, roi: null });
  const [results, setResults] = useState({ n: 0, wins: 0, losses: 0, winRate: 0 });
  const [oddsBasis, setOddsBasis] = useState<'BOOKMAKER_ODDS' | 'RESULTS_ONLY'>('RESULTS_ONLY');
  const [loading, setLoading] = useState(true);

  const team = teamParam || teams[0] || '';
  const setQ = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k); });
    router.replace(`/market/${marketName}?${next.toString()}`);
  };

  useEffect(() => {
    fetch(`/api/market-data?market=${marketName}&league=${league}&season=${season}&team=`).then((r) => r.json()).then((d) => setTeams(d.teams || [])).catch(() => {});
  }, [marketName, league, season]);

  useEffect(() => {
    let on = true;
    if (!team) { setGraphData([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      fetch(`/api/market-data?market=${marketName}&league=${league}&season=${season}&team=${encodeURIComponent(team)}`).then((r) => r.json()),
      fetch(`/api/leaderboard?market=${marketName}&league=${league}&season=${season}`).then((r) => r.json()),
    ]).then(([d, lb]) => {
      if (!on) return;
      setGraphData(d.graphData || []);
      setStats({ totalStaked: d.totalStaked ?? null, finalProfit: d.finalProfit ?? null, roi: d.roi ?? null });
      setResults(d.results || { n: 0, wins: 0, losses: 0, winRate: 0 });
      setOddsBasis(d.oddsBasis || 'RESULTS_ONLY');
      setLeaderboard(lb.leaderboard || []);
    }).catch(() => {}).finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [marketName, league, season, team]);

  const marketNames: Record<string, string> = {
    'over-1.5': 'Over 1.5 Goals', 'under-2.5': 'Under 2.5 Goals', 'btts': 'BTTS (Yes)',
    'win': 'Match Winner', 'win-or-draw': 'Win or Draw', 'no-draw': 'No Draw',
  };
  const allowed = oddsBasis === 'BOOKMAKER_ODDS';

  if (loading) return <div className="page sub">loading…</div>;

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Simulator · {LEAGUES.find((l) => l.id === league)?.name}</p>
          <h1 className="h-title">{marketNames[marketName] || marketName}</h1>
          <p className="h-desc">
            {allowed
              ? 'Flat $100 stake per match, settled at bookmaker opening odds.'
              : 'Historical bookmaker odds unavailable — results shown only. No profit, ROI, staking or ranking by profit is computed for this market.'}
          </p>
        </div>
        <div className="flex gap-2">
          <select value={league} onChange={(e) => setQ({ league: e.target.value, team: '' })} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select value={season} onChange={(e) => setQ({ season: e.target.value })} className="select-input">{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={team} onChange={(e) => setQ({ team: e.target.value })} className="select-input min-w-[150px]">
            {teams.length === 0 ? <option value="">No teams</option> : teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-5">
        {allowed ? (
          <Metrics items={[
            { label: 'Total staked', value: `$${stats.totalStaked ?? 0}` },
            { label: 'Net profit', value: `${(stats.finalProfit ?? 0) >= 0 ? '+' : '−'}$${Math.abs(stats.finalProfit ?? 0)}`, tone: (stats.finalProfit ?? 0) >= 0 ? 'pos' : 'neg', sub: `${stats.roi}% ROI` },
            { label: 'Win rate', value: `${results.winRate}%`, sub: `${results.wins}W–${results.losses}L` },
            { label: 'Matches', value: String(results.n) },
          ]} />
        ) : (
          <Metrics items={[
            { label: 'Observations', value: String(results.n) },
            { label: 'Wins', value: String(results.wins) },
            { label: 'Losses', value: String(results.losses) },
            { label: 'Win rate', value: `${results.winRate}%` },
          ]} />
        )}
      </div>

      <section className="mod">
        <div className="mod-h">
          <span className="t">{allowed ? `Cumulative profit · ${team || '—'}` : `Cumulative results (wins − losses) · ${team || '—'} — no bookmaker odds`}</span>
          <span className="sub mono">{SEASONS.find((s) => s.id === season)?.name}</span>
        </div>
        {graphData.length === 0 ? <p className="sub py-10 text-center">No data for this selection</p> : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={graphData} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="matchweek" tick={{ fontSize: 10, fill: '#5C6670', fontFamily: 'var(--mono)' }} stroke="rgba(255,255,255,0.1)" tickLine={false}
                  label={{ value: 'MATCHWEEK', position: 'insideBottom', offset: -1, fontSize: 9, fill: '#5C6670', letterSpacing: 1 }} />
                <YAxis tick={{ fontSize: 10, fill: '#5C6670', fontFamily: 'var(--mono)' }} stroke="rgba(255,255,255,0.1)" tickLine={false}
                  label={{ value: allowed ? 'PROFIT $' : 'NET HITS', angle: -90, position: 'insideLeft', offset: 16, fontSize: 9, fill: '#5C6670', letterSpacing: 1 }} />
                <Tooltip contentStyle={{ backgroundColor: '#0E1116', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, fontSize: 11, fontFamily: 'var(--mono)', color: '#D6DBE1' }}
                  formatter={(v: any) => allowed ? [`$${v}`, 'cumulative profit'] : [`${v > 0 ? '+' : ''}${v}`, 'net hits (W−L)']} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" />
                <Line type="monotone" dataKey="cumulative" stroke="var(--acc)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mod-h mt-6 mb-2" style={{ borderTop: '1px solid var(--line2)', paddingTop: 12 }}>
          <span className="t">League leaderboard · same market & season</span>
          <span className="sub mono">{leaderboard.length} teams</span>
        </div>
        {!allowed && <p className="sub mb-2">Historical bookmaker odds unavailable — ordered by matches played, then win rate. Profit and ROI are not computed.</p>}
        <div className="table-wrap max-h-[380px] overflow-y-auto">
          <table className="data">
            <thead className="sticky top-0" style={{ background: 'var(--bg)' }}>
              <tr>
                <th className="w-8">#</th><th>Team</th><th className="num">P</th><th className="num">W</th><th className="num">L</th><th className="num">Win %</th>
                {allowed && <><th className="num">Profit</th><th className="num">ROI</th></>}
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((row, i) => (
                <tr key={row.team} className={row.team === team ? 'bg-[var(--sf2)]' : ''}>
                  <td className="mut mono">{i + 1}</td>
                  <td className="name"><span className="flex items-center gap-2"><Crest name={row.team} size={15} /> {row.team}</span></td>
                  <td className="num">{row.played}</td>
                  <td className="num">{row.wins}</td>
                  <td className="num">{row.losses}</td>
                  <td className="num">{row.winRate}</td>
                  {allowed && <>
                    <td className={`num ${(row.finalProfit ?? 0) >= 0 ? 'pos' : 'neg'}`}>{row.finalProfit != null ? `${row.finalProfit >= 0 ? '+' : '−'}$${Math.abs(row.finalProfit)}` : '—'}</td>
                    <td className={`num ${(row.roi ?? 0) >= 0 ? 'pos' : 'neg'}`}>{row.roi != null ? `${row.roi >= 0 ? '+' : ''}${row.roi}%` : '—'}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function MarketPage() {
  return (
    <Suspense fallback={<div className="page sub">loading…</div>}>
      <Inner />
    </Suspense>
  );
}