"use client";
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LEAGUES } from '@/lib/constants';
import { Readout } from '@/components/ui';

type Fixture = { id: string; date: string; time?: string; matchday?: any; league: string; leagueName?: string; home: string; away: string; source?: string };

export default function CalendarPage() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(todayStr.slice(0, 7));
  const [serverFixtures, setServerFixtures] = useState<Fixture[]>([]);
  const [localFixtures, setLocalFixtures] = useState<Fixture[]>([]);
  const [loadError, setLoadError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [allTeams, setAllTeams] = useState<Record<string, string[]>>({});
  const [newLeague, setNewLeague] = useState('epl');
  const [newHome, setNewHome] = useState('');
  const [newAway, setNewAway] = useState('');
  const [newDate, setNewDate] = useState(todayStr);
  const [newTime, setNewTime] = useState('');

  useEffect(() => {
    fetch('/api/fixtures').then((r) => r.json()).then((d) => {
      setServerFixtures(d.fixtures || []);
      if (d.errors?.length) setLoadError(d.errors.join(' · '));
    }).catch(() => setLoadError('Could not read fixture files'));
    const saved = localStorage.getItem('my_custom_fixtures');
    if (saved) { try { setLocalFixtures(JSON.parse(saved)); } catch {} }
    fetch('/api/teams').then((r) => r.json()).then((d) => setAllTeams(d.teamsByLeague || {})).catch(() => {});
  }, []);

  useEffect(() => { localStorage.setItem('my_custom_fixtures', JSON.stringify(localFixtures)); }, [localFixtures]);

  const fixtures = useMemo(() => [...serverFixtures, ...localFixtures], [serverFixtures, localFixtures]);
  const byDate = useMemo(() => {
    const map: Record<string, Fixture[]> = {};
    fixtures.forEach((f) => { (map[f.date] ||= []).push(f); });
    Object.values(map).forEach((l) => l.sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))));
    return map;
  }, [fixtures]);
  const upcoming = useMemo(() => fixtures.filter((f) => f.date >= todayStr).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`)), [fixtures, todayStr]);
  const dayGroups = useMemo(() => {
    if (!selectedDate) return [] as [string, Fixture[]][];
    const g: Record<string, Fixture[]> = {};
    (byDate[selectedDate] || []).forEach((f) => { (g[f.league] ||= []).push(f); });
    return Object.entries(g);
  }, [selectedDate, byDate]);

  const [y, m] = month.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1).getDay();
  const daysIn = new Date(y, m, 0).getDate();
  const monthName = new Date(y, m - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' });
  const leagueTeams = allTeams[newLeague] || [];
  const leagueName = (id: string) => LEAGUES.find((l) => l.id === id)?.name || id;
  const dayCount = selectedDate ? (byDate[selectedDate] || []).length : 0;

  const researchHref = (f: Fixture) =>
    `/research?home=${encodeURIComponent(f.home)}&away=${encodeURIComponent(f.away)}&league=${f.league}&date=${f.date}`;

  function changeMonth(d: number) { setMonth(new Date(y, m - 1 + d, 1).toISOString().slice(0, 7)); }
  function removeFixture(id: string) { setLocalFixtures((p) => p.filter((f) => f.id !== id)); }
  function addFixture() {
    if (!newHome || !newAway || newHome === newAway) return;
    setLocalFixtures((p) => [...p, { id: `manual-${Date.now()}`, date: newDate, time: newTime, league: newLeague, home: newHome, away: newAway, source: 'manual' }]);
    setShowAddForm(false); setNewHome(''); setNewAway(''); setNewTime('');
    setSelectedDate(newDate); setMonth(newDate.slice(0, 7));
  }

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Fixtures</p>
          <h1 className="h-title">Fixture browser</h1>
          <p className="h-desc">Season schedule from public/fixtures · click any fixture to open Match Research.</p>
        </div>
        <div className="flex items-center gap-2">
          <Readout items={[{ k: 'loaded', v: String(fixtures.length) }, { k: 'upcoming', v: String(upcoming.length) }]} />
          <button onClick={() => setShowAddForm(true)} className="btn-ghost">+ Add</button>
        </div>
      </div>
      {loadError && <p className="neg text-[12px] mt-3">{loadError}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 mt-6">
        <div className="min-w-0">
          <div className="mod-h">
            <span className="t mono uppercase">{monthName}</span>
            <span className="flex gap-1.5">
              <button onClick={() => changeMonth(-1)} className="btn-ghost px-2 py-0 mono">‹</button>
              <button onClick={() => changeMonth(1)} className="btn-ghost px-2 py-0 mono">›</button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-px bg-[var(--line2)] border border-[var(--line2)]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="eyebrow py-1.5 text-center bg-[var(--bg)]">{d}</div>
            ))}
            {[...Array(firstDay).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)].map((day, i) => {
              if (day === null) return <div key={i} className="h-10 bg-[var(--bg)]" />;
              const ds = `${month}-${String(day).padStart(2, '0')}`;
              const count = (byDate[ds] || []).length;
              const isToday = ds === todayStr;
              const isSel = ds === selectedDate;
              return (
                <button key={i} onClick={() => setSelectedDate(ds)}
                  className={`h-10 relative mono text-[11px] bg-[var(--bg)] transition-colors
                    ${isSel ? 'bg-[var(--sf2)] text-[#E8ECF0] shadow-[inset_0_0_0_1px_var(--line)]' : count ? 'text-[var(--tx)] hover:bg-[var(--sf)]' : 'text-[var(--faint)]'}
                    ${isToday && !isSel ? 'shadow-[inset_0_-1px_0_var(--acc)]' : ''}`}>
                  {day}
                  {count > 0 && <span className="absolute top-1 right-1.5 text-[9px] text-[var(--faint)]">{count}</span>}
                  {count > 0 && <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full bg-[var(--acc)] opacity-80"></span>}
                </button>
              );
            })}
          </div>
          <p className="sub mt-2 mono">· dot = fixtures · count top-right · underline = today</p>
        </div>

        <div className="min-w-0">
          <div className="mod-h">
            <span className="t mono">{selectedDate || 'NO DATE SELECTED'}</span>
            <span className="sub mono">{dayCount} fx</span>
          </div>
          <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
            {!selectedDate ? <p className="sub">Select a date with fixtures.</p>
              : dayGroups.length === 0 ? <p className="sub">No fixtures this day.</p>
              : dayGroups.map(([lg, list]) => (
                <div key={lg}>
                  <p className="eyebrow mb-1.5">{leagueName(lg)}</p>
                  <div className="space-y-[3px]">
                    {list.map((f) => (
                      <div key={f.id} className="grid grid-cols-[40px_1fr_14px] items-baseline gap-2 group">
                        <span className="sub mono">{f.time || '—'}</span>
                        <Link href={researchHref(f)} className="text-[12px] text-[var(--tx)] truncate hover:text-[var(--acc)] transition-colors" title="Open Match Research">
                          {f.home} v {f.away}
                        </Link>
                        {f.source !== 'file' && <button onClick={() => removeFixture(f.id)} className="mut hover:neg text-[11px] opacity-0 group-hover:opacity-100">×</button>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <div className="mod">
            <div className="mod-h"><span className="t">Upcoming</span><span className="sub mono">{upcoming.length}</span></div>
            <div className="space-y-[3px] max-h-[240px] overflow-y-auto pr-1">
              {upcoming.length === 0 ? <p className="sub">Nothing scheduled.</p>
                : upcoming.slice(0, 25).map((f) => (
                  <div key={f.id} className="grid grid-cols-[40px_1fr_auto] items-baseline gap-2">
                    <span className="sub mono">{f.date.slice(5)}</span>
                    <Link href={researchHref(f)} className="text-[11.5px] text-[var(--dim)] truncate hover:text-[var(--acc)] transition-colors" title="Open Match Research">
                      {f.home} v {f.away}
                    </Link>
                    <span className="sub uppercase tracking-wider text-[9px]">{(f.leagueName || f.league).split(' ')[0]}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--sf)] border border-[var(--line)] rounded-[4px] p-5 w-full max-w-sm space-y-3">
            <p className="text-[13px] font-semibold text-[#E8ECF0]">Add fixture</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="select-input w-full" />
              <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="select-input w-full" />
            </div>
            <select value={newLeague} onChange={(e) => { setNewLeague(e.target.value); setNewHome(''); setNewAway(''); }} className="select-input w-full">
              {LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={newHome} onChange={(e) => setNewHome(e.target.value)} className="select-input"><option value="">Home…</option>{leagueTeams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              <select value={newAway} onChange={(e) => setNewAway(e.target.value)} className="select-input"><option value="">Away…</option>{leagueTeams.filter((t) => t !== newHome).map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowAddForm(false)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={addFixture} className="btn-primary flex-1">Add</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}