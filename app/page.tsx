"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import Crest from '@/components/Crest';
import { Metrics, Mod, Readout } from '@/components/ui';

type Fixture = { id: string; date: string; time?: string; league: string; leagueName?: string; home: string; away: string };
const TABS = [{ id: 'epl', name: 'EPL' }, { id: 'spain', name: 'LA LIGA' }, { id: 'italy', name: 'SERIE A' }, { id: 'germany', name: 'BUNDESLIGA' }];

export default function DashboardPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [curveTeam, setCurveTeam] = useState('');
  const [curve, setCurve] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalStaked: 0, finalProfit: 0, roi: '0.00' });
  const [tabLeague, setTabLeague] = useState('epl');
  const [table, setTable] = useState<any[]>([]);
  const [name, setName] = useState('analyst');

  useEffect(() => {
    const s = localStorage.getItem('fa_session');
    if (s) setName(s.split('@')[0]);
    fetch('/api/fixtures').then((r) => r.json()).then((d) => setFixtures(d.fixtures || [])).catch(() => {});
    fetch('/api/teams').then((r) => r.json()).then((d) => {
      const epl: string[] = d.teamsByLeague?.epl || [];
      setTeams(epl);
      setCurveTeam(epl.includes('Arsenal') ? 'Arsenal' : epl[0] || '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!curveTeam) return;
    fetch(`/api/market-data?market=over-1.5&league=epl&season=26&team=${encodeURIComponent(curveTeam)}`)
      .then((r) => r.json())
      .then((d) => { setCurve(d.graphData || []); setStats({ totalStaked: d.totalStaked || 0, finalProfit: d.finalProfit || 0, roi: d.roi || '0.00' }); })
      .catch(() => {});
  }, [curveTeam]);

  useEffect(() => {
    fetch(`/api/standings?league=${tabLeague}&season=26`).then((r) => r.json()).then((d) => setTable(d.table || [])).catch(() => {});
  }, [tabLeague]);

  const upcoming = useMemo(() => fixtures.filter((f) => f.date >= todayStr).slice(0, 7), [fixtures, todayStr]);
  const nextMatches = useMemo(() => {
    const today = fixtures.filter((f) => f.date === todayStr);
    if (today.length) return { list: today.slice(0, 4), label: `TODAY · ${todayStr}` };
    const nd = upcoming[0]?.date;
    return { list: fixtures.filter((f) => f.date === nd).slice(0, 4), label: nd ? `NEXT MATCHDAY · ${nd}` : 'NO FIXTURES LOADED' };
  }, [fixtures, todayStr, upcoming]);

  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const wins = curve.filter((g) => g.hit).length;
  const winRate = curve.length ? Math.round((wins / curve.length) * 100) : 0;

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Dashboard</p>
          <h1 className="h-title">{greet}, <span className="capitalize">{name}</span></h1>
        </div>
        <Readout items={[{ k: 'date', v: todayStr }, { k: 'fixtures loaded', v: String(fixtures.length) }, { k: 'leagues', v: '7' }]} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-8 mt-6">
        {/* main column */}
        <div className="min-w-0">
          <Mod first title={nextMatches.label} right={<Link href="/calendar">calendar →</Link>}>
            {nextMatches.list.length === 0 ? <p className="sub">No fixtures loaded — check public/fixtures.</p> : (
              <div className="space-y-[3px]">
                {nextMatches.list.map((f) => (
                  <div key={f.id} className="grid grid-cols-[44px_1fr_auto] items-baseline gap-2 py-[2px]">
                    <span className="sub mono">{f.time || '—'}</span>
                    <span className="text-[12.5px] text-[var(--tx)] flex items-center gap-2 min-w-0">
                      <Crest name={f.home} size={14} /> {f.home} <span className="mut">v</span> <Crest name={f.away} size={14} /> {f.away}
                    </span>
                    <span className="sub uppercase tracking-wider text-[9.5px]">{(f.leagueName || f.league).split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </Mod>

          <Mod title="PERFORMANCE · OVER 1.5 GOALS" right={
            <select value={curveTeam} onChange={(e) => setCurveTeam(e.target.value)} className="select-input">
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          }>
            <Metrics items={[
              { label: 'Staked', value: `$${stats.totalStaked}` },
              { label: 'Net profit', value: `${stats.finalProfit >= 0 ? '+' : '−'}$${Math.abs(stats.finalProfit)}`, tone: stats.finalProfit >= 0 ? 'pos' : 'neg', sub: `${stats.roi}% ROI` },
              { label: 'Win rate', value: `${winRate}%`, sub: `${wins}W–${curve.length - wins}L` },
              { label: 'Matches', value: String(curve.length) },
            ]} />
            <div className="h-[220px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curve} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="matchweek" tick={{ fontSize: 10, fill: '#5C6670', fontFamily: 'var(--mono)' }} stroke="rgba(255,255,255,0.1)" tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#5C6670', fontFamily: 'var(--mono)' }} stroke="rgba(255,255,255,0.1)" tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0E1116', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, fontSize: 11, fontFamily: 'var(--mono)', color: '#D6DBE1' }}
                    formatter={(v: any) => [`$${v}`, 'cumulative']} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.14)" />
                  <Line type="monotone" dataKey="cumulative" stroke="var(--acc)" strokeWidth={1.5} dot={false} activeDot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Mod>
        </div>

        {/* right rail */}
        <div className="min-w-0">
          <Mod first title="UPCOMING" right={<Link href="/calendar">all →</Link>}>
            <div className="space-y-[3px]">
              {upcoming.length === 0 ? <p className="sub">Nothing scheduled.</p> : upcoming.map((f) => (
                <div key={f.id} className="grid grid-cols-[40px_1fr] gap-2 items-baseline">
                  <span className="sub mono">{f.date.slice(5)}</span>
                  <span className="text-[11.5px] text-[var(--dim)] truncate">{f.home} v {f.away}</span>
                </div>
              ))}
            </div>
          </Mod>

          <Mod title="STANDINGS">
            <div className="tabs mb-3">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTabLeague(t.id)} className={`mod-tab ${tabLeague === t.id ? 'on' : ''}`}>{t.name}</button>
              ))}
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th className="w-6">#</th><th>Team</th><th className="num">P</th><th className="num">GD</th><th className="num">Pts</th></tr></thead>
                <tbody>
                  {table.slice(0, 6).map((r, i) => (
                    <tr key={r.team}>
                      <td className="mut mono">{i + 1}</td>
                      <td className="name"><span className="flex items-center gap-2"><Crest name={r.team} size={14} /> {r.team}</span></td>
                      <td className="num">{r.p}</td>
                      <td className="num">{r.gd > 0 ? `+${r.gd}` : r.gd}</td>
                      <td className="num">{r.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Mod>
        </div>
      </div>

      <div className="mod flex flex-wrap items-center justify-between gap-2">
        <p className="sub"><span className="pos">●</span> live data · updated {todayStr}</p>
        <p className="sub mono uppercase">EPL · La Liga · Serie A · Bundesliga · Ligue 1 · Eredivisie · Belgium</p>
      </div>
    </div>
  );
}