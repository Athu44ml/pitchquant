"use client";
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function TopBar() {
  const router = useRouter();
  const [teams, setTeams] = useState<string[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/teams').then((r) => r.json()).then((d) => {
      const list: string[] = [];
      Object.entries(d.teamsByLeague || {}).forEach(([lg, ts]: any) => ts.forEach((t: string) => list.push(`${t}|${lg}`)));
      setTeams(list);
    }).catch(() => {});
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const query = q.trim().toLowerCase();
    if (!query) return;
    const hit = teams.find((x) => x.split('|')[0].toLowerCase() === query) || teams.find((x) => x.split('|')[0].toLowerCase().includes(query));
    if (hit) {
      const [team, league] = hit.split('|');
      router.push(`/market/over-1.5?league=${league}&team=${encodeURIComponent(team)}`);
      setQ('');
    }
  }

  return (
    <header className="h-11 shrink-0 flex items-center gap-3 px-4 border-b border-[var(--line)] bg-[var(--bg)]">
      <form onSubmit={submit} className="relative w-[260px]">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--faint)] text-[12px] leading-none">⌕</span>
        <input
          list="team-list" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search team…"
          className="w-full bg-[var(--sf)] border border-[var(--line)] rounded-[3px] pl-6 pr-2 py-[4px] text-[11.5px] text-[var(--tx)] placeholder:text-[var(--faint)] focus:outline-none focus:border-[rgba(47,191,113,0.4)]"
        />
        <datalist id="team-list">{teams.map((x) => <option key={x} value={x.split('|')[0]} />)}</datalist>
      </form>
      <div className="ml-auto flex items-center gap-4">
        <span className="sub mono">SEASON 2026/27</span>
        <span className="sub flex items-center gap-1.5"><span className="w-[5px] h-[5px] rounded-full bg-[var(--acc)]"></span>DATA CURRENT</span>
      </div>
    </header>
  );
}