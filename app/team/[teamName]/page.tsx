"use client";
import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { LEAGUES, SEASONS } from '@/lib/constants';
import { Mod, Readout, ConfidenceBadge, MethodologyNote } from '@/components/ui';
import Crest from '@/components/Crest';

const MARKETS = [
  { id: 'over-1.5', name: 'Over 1.5' }, { id: 'under-2.5', name: 'Under 2.5' },
  { id: 'btts', name: 'BTTS' }, { id: 'win', name: 'Match Winner' },
  { id: 'win-or-draw', name: 'Win or Draw' }, { id: 'no-draw', name: 'No Draw' },
];

function Inner() {
  const params = useParams();
  const router = useRouter();
  const sp = useSearchParams();

  // URL is the single source of truth — selects, data and address bar can never disagree
  const team = decodeURIComponent((params.teamName as string) || '');
  const league = sp.get('league') || 'epl';
  const season = sp.get('season') || '26';
  const market = sp.get('market') || 'over-1.5';

  const [teams, setTeams] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);

  const go = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => next.set(k, v));
    router.replace(`/team/${encodeURIComponent(team)}?${next.toString()}`);
  };

  // Load league's team list; if current team doesn't compete here, jump to the first team that does
  useEffect(() => {
    let on = true;
    fetch('/api/teams').then((r) => r.json()).then((d) => {
      if (!on) return;
      const list: string[] = d.teamsByLeague?.[league] || [];
      setTeams(list);
      if (list.length && !list.includes(team)) {
        router.replace(`/team/${encodeURIComponent(list[0])}?league=${league}&season=${season}&market=${market}`);
      }
    }).catch(() => {});
    return () => { on = false; };
  }, [league, season, market, team, router]);

  useEffect(() => {
    let on = true;
    setData(null);
    fetch(`/api/team-lab?team=${encodeURIComponent(team)}&league=${league}&season=${season}&market=${market}`)
      .then((r) => r.json()).then((d) => { if (on) setData(d); }).catch(() => {});
    return () => { on = false; };
  }, [team, league, season, market]);

  const allowed = data?.oddsBasis === 'BOOKMAKER_ODDS';

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <Crest name={team} size={28} />
          <div>
            <p className="eyebrow mb-1">Team Lab</p>
            <h1 className="h-title">{team}</h1>
            <p className="h-desc">Deep-dive into a team's historical market performance.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <select value={team} onChange={(e) => router.replace(`/team/${encodeURIComponent(e.target.value)}?league=${league}&season=${season}&market=${market}`)} className="select-input min-w-[140px]">
            {teams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={league} onChange={(e) => go({ league: e.target.value })} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select value={season} onChange={(e) => go({ season: e.target.value })} className="select-input">{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={market} onChange={(e) => go({ market: e.target.value })} className="select-input">{MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
        </div>
      </div>

      {!data ? <p className="sub mt-8">loading…</p> : (
        <>
          {!allowed && <p className="sub mt-4">Historical bookmaker odds unavailable for this market — results only. No profit, ROI or odds-bucket analysis is computed.</p>}

          <Mod first title="MARKET PERFORMANCE OVERVIEW" right={<span className="sub mono">{market} · {season}</span>}>
            <Readout items={allowed ? [
              { k: 'observations', v: String(data.overview.n) },
              { k: 'wins', v: String(data.overview.wins) },
              { k: 'win rate', v: data.overview.n ? data.overview.winRate + '%' : '—' },
              { k: 'avg odds', v: data.overview.avgOdds != null ? data.overview.avgOdds.toFixed(2) : '—' },
              { k: 'net P/L', v: `${data.overview.profit >= 0 ? '+' : '−'}$${Math.abs(data.overview.profit)}`, tone: data.overview.profit >= 0 ? 'pos' : 'neg' },
            ] : [
              { k: 'observations', v: String(data.overview.n) },
              { k: 'wins', v: String(data.overview.wins) },
              { k: 'losses', v: String(data.overview.losses) },
              { k: 'win rate', v: data.overview.n ? data.overview.winRate + '%' : '—' },
            ]} />
            <div className="mt-3 flex justify-end"><ConfidenceBadge wins={data.overview.wins} n={data.overview.n} /></div>
          </Mod>

          <Mod title="HOME / AWAY SPLIT">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Venue</th><th className="num">N</th><th className="num">Wins</th><th className="num">Win %</th>{allowed && <><th className="num">Avg odds</th><th className="num">P/L</th></>}<th>Evidence</th></tr></thead>
                <tbody>
                  {([['Home', data.home], ['Away', data.away], ['Overall', data.overview]] as [string, any][]).map(([label, d]) => (
                    <tr key={label}>
                      <td className="name">{label}</td>
                      <td className="num">{d.n}</td>
                      <td className="num">{d.wins}</td>
                      <td className="num">{d.n ? d.winRate + '%' : '—'}</td>
                      {allowed && <>
                        <td className="num">{d.avgOdds != null ? d.avgOdds.toFixed(2) : '—'}</td>
                        <td className={`num ${d.profit >= 0 ? 'pos' : 'neg'}`}>{d.profit != null ? `${d.profit >= 0 ? '+' : '−'}$${Math.abs(d.profit)}` : '—'}</td>
                      </>}
                      <td><ConfidenceBadge wins={d.wins} n={d.n} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Mod>

          <Mod title="PERFORMANCE BY ODDS RANGE">
            {allowed ? (
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Bucket</th><th className="num">N</th><th className="num">Wins</th><th className="num">Win %</th><th className="num">Avg odds</th><th className="num">P/L</th><th>Evidence</th></tr></thead>
                  <tbody>
                    {data.buckets.map((b: any) => (
                      <tr key={b.range}>
                        <td className="name mono">{b.range}</td>
                        <td className="num">{b.n}</td>
                        <td className="num">{b.wins}</td>
                        <td className="num">{b.n ? b.winRate + '%' : '—'}</td>
                        <td className="num">{b.avgOdds != null ? b.avgOdds.toFixed(2) : '—'}</td>
                        <td className={`num ${b.profit >= 0 ? 'pos' : 'neg'}`}>{b.profit != null ? `${b.profit >= 0 ? '+' : '−'}$${Math.abs(b.profit)}` : '—'}</td>
                        <td><ConfidenceBadge wins={b.wins} n={b.n} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="sub">No genuine bookmaker odds exist for this market in the dataset — odds-range analysis is unavailable rather than estimated.</p>
            )}
          </Mod>

          <Mod title="RECENT FORM (LAST 10)">
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Date</th><th>Opponent</th><th>Venue</th>{allowed && <th className="num">Odds</th>}<th>Result</th>{allowed && <th className="num">P/L</th>}</tr></thead>
                <tbody>
                  {data.form.map((r: any, i: number) => (
                    <tr key={i}>
                      <td className="mut mono">{r.date}</td>
                      <td className="name">{r.opponent}</td>
                      <td className="mut mono">{r.venue}</td>
                      {allowed && <td className="num">{r.odds != null ? r.odds.toFixed(2) : '—'}</td>}
                      <td><span className={`mono text-[10px] ${r.hit ? 'pos' : 'neg'}`}>{r.hit ? 'WON' : 'LOST'}</span></td>
                      {allowed && <td className={`num ${r.profit >= 0 ? 'pos' : 'neg'}`}>{r.profit != null ? `${r.profit >= 0 ? '+' : '−'}$${Math.abs(r.profit)}` : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <MethodologyNote>Odds and results reuse the same market logic as the simulators. P/L assumes a flat $100 hypothetical stake and is shown only where genuine bookmaker odds exist. Historical study only — not a prediction.</MethodologyNote>
          </Mod>
        </>
      )}
    </div>
  );
}

export default function TeamLabPage() {
  return (
    <Suspense fallback={<div className="page sub">loading…</div>}>
      <Inner />
    </Suspense>
  );
}