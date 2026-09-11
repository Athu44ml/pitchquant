"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LEAGUES } from '@/lib/constants';
import { Mod, Readout, Metrics, ConfidenceBadge, MethodologyNote } from '@/components/ui';
import Crest from '@/components/Crest';

const MARKETS = [
  { id: 'over-1.5', name: 'Over 1.5 Goals' }, { id: 'under-2.5', name: 'Under 2.5 Goals' },
  { id: 'btts', name: 'BTTS (Yes)' }, { id: 'win', name: 'Match Winner' },
  { id: 'win-or-draw', name: 'Win or Draw' }, { id: 'no-draw', name: 'No Draw' },
];

type Sel = { home: string; away: string; league: string; date: string; time?: string };

export default function MatchResearchPage() {
  const router = useRouter();
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [sel, setSel] = useState<Sel | null>(null);
  const [market, setMarket] = useState('over-1.5');
  const [homeLab, setHomeLab] = useState<any>(null);
  const [awayLab, setAwayLab] = useState<any>(null);
  const [h2h, setH2h] = useState<any[]>([]);
  const [modelQ, setModelQ] = useState<any>(null);

  useEffect(() => {
    fetch('/api/fixtures').then((r) => r.json()).then((d) => {
      const today = new Date().toISOString().slice(0, 10);
      const list = (d.fixtures || []).filter((f: any) => f.date >= today);
      setFixtures(list);
      const q = new URLSearchParams(window.location.search);
      const home = q.get('home');
      const away = q.get('away');
      const fromUrl = list.find((f: any) => f.home === home && f.away === away);
      const first = fromUrl || (home && away ? { home, away, league: q.get('league') || 'epl', date: q.get('date') || '' } : list[0]);
      if (first) setSel({ home: first.home, away: first.away, league: first.league, date: first.date, time: first.time });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sel) return;
    const q = `league=${sel.league}&season=26&market=${market}`;
    Promise.all([
      fetch(`/api/team-lab?team=${encodeURIComponent(sel.home)}&${q}`).then((r) => r.json()),
      fetch(`/api/team-lab?team=${encodeURIComponent(sel.away)}&${q}`).then((r) => r.json()),
      fetch(`/api/h2h?league=${sel.league}&home=${encodeURIComponent(sel.home)}&away=${encodeURIComponent(sel.away)}`).then((r) => r.json()),
    ]).then(([h, a, m]) => {
      setHomeLab(h);
      setAwayLab(a);
      setH2h(m.meetings || []);
    }).catch(() => {});
  }, [sel, market]);

  useEffect(() => {
    if (!sel) return;
    fetch(`/api/model-odds?league=${sel.league}&season=26&home=${encodeURIComponent(sel.home)}&away=${encodeURIComponent(sel.away)}&market=${market}&side=home`)
      .then((r) => r.json()).then(setModelQ).catch(() => {});
  }, [sel, market]);

  const pick = (f: any) => {
    setSel({ home: f.home, away: f.away, league: f.league, date: f.date, time: f.time });
    router.replace(`/research?home=${encodeURIComponent(f.home)}&away=${encodeURIComponent(f.away)}&league=${f.league}&date=${f.date}`);
  };

  const leagueName = (id: string) => LEAGUES.find((l) => l.id === id)?.name || id;
  const resultsOnly = homeLab?.oddsBasis === 'RESULTS_ONLY';

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Match Research</p>
          <h1 className="h-title">
            {sel ? (
              <span className="flex items-center gap-2">
                <Crest name={sel.home} size={20} /> {sel.home}
                <span className="mut text-[13px]">v</span>
                <Crest name={sel.away} size={20} /> {sel.away}
              </span>
            ) : 'Match Research'}
          </h1>
          <p className="h-desc">
            {sel ? `${leagueName(sel.league)} · ${sel.date}${sel.time ? ` ${sel.time}` : ''} · historical evidence only, no prediction` : 'Loading fixtures…'}
          </p>
        </div>
        <select value={market} onChange={(e) => setMarket(e.target.value)} className="select-input">
          {MARKETS.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-8 mt-6">
        {/* fixture rail */}
        <div className="min-w-0">
          <div className="mod-h"><span className="t">Upcoming fixtures</span><span className="sub mono">{fixtures.length}</span></div>
          <div className="space-y-[2px] max-h-[520px] overflow-y-auto pr-1">
            {fixtures.slice(0, 40).map((f, i) => {
              const active = sel && f.home === sel.home && f.away === sel.away;
              return (
                <button key={i} onClick={() => pick(f)}
                  className={`w-full text-left grid grid-cols-[52px_1fr] gap-2 items-baseline px-1.5 py-[4px] rounded-[3px] transition-colors
                    ${active ? 'bg-[var(--sf2)] shadow-[inset_1px_0_0_var(--acc)]' : 'hover:bg-[var(--sf)]'}`}>
                  <span className="sub mono">{f.date.slice(5)}</span>
                  <span className={`text-[11.5px] truncate ${active ? 'text-[#E8ECF0]' : 'text-[var(--dim)]'}`}>{f.home} v {f.away}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* research content */}
        <div className="min-w-0">
          {!sel ? <p className="sub">No upcoming fixtures loaded — check public/fixtures.</p> : (
            <>
              {resultsOnly && <p className="sub mb-3">Historical bookmaker odds unavailable for this market — results only. No profit or odds figures are shown.</p>}
              <Mod first title="TEAM SNAPSHOTS · SELECTED MARKET">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {[homeLab, awayLab].map((lab, i) => lab && (
                    <div key={i}>
                      <p className="text-[12.5px] text-[var(--tx)] font-medium mb-2 flex items-center gap-2">
                        <Crest name={lab.team} size={15} /> {lab.team}
                      </p>
                      {lab.oddsBasis === 'BOOKMAKER_ODDS' ? (
                        <Metrics items={[
                          { label: 'Observations', value: String(lab.overview.n) },
                          { label: 'Wins', value: String(lab.overview.wins) },
                          { label: 'Avg odds', value: lab.overview.avgOdds != null ? lab.overview.avgOdds.toFixed(2) : '—' },
                          { label: 'Net P/L', value: lab.overview.profit != null ? `${lab.overview.profit >= 0 ? '+' : '−'}$${Math.abs(lab.overview.profit)}` : '—', tone: (lab.overview.profit ?? 0) >= 0 ? 'pos' : 'neg' },
                        ]} />
                      ) : (
                        <Metrics items={[
                          { label: 'Observations', value: String(lab.overview.n) },
                          { label: 'Wins', value: String(lab.overview.wins) },
                          { label: 'Losses', value: String(lab.overview.losses) },
                          { label: 'Win rate', value: lab.overview.n ? lab.overview.winRate + '%' : '—' },
                        ]} />
                      )}
                      <div className="mt-2 flex justify-end"><ConfidenceBadge wins={lab.overview.wins} n={lab.overview.n} /></div>
                    </div>
                  ))}
                </div>
              </Mod>

              <Mod title="MODEL VS MARKET">
                {modelQ ? (
                  <>
                    <Readout items={[
                      { k: 'model p', v: modelQ.prob != null ? (modelQ.prob * 100).toFixed(1) + '%' : '—' },
                      { k: 'fair odds', v: modelQ.fairOdds ?? '—' },
                      { k: 'basis', v: modelQ.probs?.basis || '—' },
                      { k: 'λ / μ', v: `${modelQ.probs?.lambda} / ${modelQ.probs?.mu}` },
                      { k: 'evidence', v: `N=${modelQ.confidence?.n} · ${modelQ.confidence?.label}` },
                    ]} />
                    <p className="sub mt-2">
                      This module reports the model's own probability and fair odds. Live bookmaker prices for upcoming fixtures are on Find Your Odds (/odds), sourced from the connected provider.
                    </p>
                  </>
                ) : <p className="sub">model unavailable for this fixture</p>}
              </Mod>

              <Mod title="HEAD-TO-HEAD (LAST MEETINGS)">
                {h2h.length === 0 ? <p className="sub">No previous meetings found in loaded seasons.</p> : (
                  <div className="table-wrap">
                    <table className="data">
                      <thead><tr><th>Date</th><th>Fixture</th><th className="num">Score</th><th>Result</th></tr></thead>
                      <tbody>
                        {h2h.map((m, i) => (
                          <tr key={i}>
                            <td className="mut mono">{m.date}</td>
                            <td className="name">{m.home} v {m.away}</td>
                            <td className="num">{m.hg}–{m.ag}</td>
                            <td><span className={`mono text-[10px] ${m.hg > m.ag ? 'pos' : m.hg < m.ag ? 'neg' : 'mut'}`}>{m.hg > m.ag ? 'HOME' : m.hg < m.ag ? 'AWAY' : 'DRAW'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Mod>

              <Mod title="DATA QUALITY">
                <Readout items={[
                  { k: 'home N', v: String(homeLab?.overview.n ?? 0) },
                  { k: 'away N', v: String(awayLab?.overview.n ?? 0) },
                  { k: 'meetings', v: String(h2h.length) },
                  { k: 'market', v: market },
                  { k: 'season', v: '2026/27' },
                ]} />
                {(homeLab?.overview.n < 10 || awayLab?.overview.n < 10) && (
                  <p className="neg text-[11px] mt-2">Insufficient sample on at least one side (N &lt; 10). Treat comparisons as indicative only.</p>
                )}
                <MethodologyNote>
                  Figures are historical frequencies for the selected market plus prior head-to-head results. Wilson 95% confidence intervals shown per team. Model probabilities use rolling pre-match data only. This page reports what already happened — it does not estimate the probability of the upcoming fixture.
                </MethodologyNote>
              </Mod>
            </>
          )}
        </div>
      </div>
    </div>
  );
}