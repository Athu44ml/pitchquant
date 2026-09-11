"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LeagueBadge from './LeagueBadge';
import UserChip from './UserChip';

const LEAGUES = [
  { id: 'epl', name: 'Premier League' },
  { id: 'spain', name: 'La Liga' },
  { id: 'italy', name: 'Serie A' },
  { id: 'germany', name: 'Bundesliga' },
  { id: 'france', name: 'Ligue 1' },
  { id: 'netherlands', name: 'Eredivisie' },
  { id: 'belgium', name: 'Belgian Pro League' },
];

const MARKETS = [
  { id: 'over-1.5', name: 'Over 1.5 Goals' },
  { id: 'under-2.5', name: 'Under 2.5 Goals' },
  { id: 'btts', name: 'BTTS (Yes)' },
  { id: 'win', name: 'Match Winner' },
  { id: 'win-or-draw', name: 'Win or Draw' },
  { id: 'no-draw', name: 'No Draw' },
];

export default function SideNav() {
  const path = usePathname();

  const on = (href: string) => {
    const clean = href.split('?')[0];
    if (clean === '/') return path === '/';
    if (clean.startsWith('/team/')) return path.startsWith('/team/');
    if (clean.startsWith('/market/')) return path.startsWith('/market/');
    return path.startsWith(clean);
  };

  const item = (href: string, label: React.ReactNode, track = true) => (
    <Link
      key={href}
      href={href}
      className={`flex items-center gap-2 px-2 py-[3.5px] rounded-[3px] text-[12px] transition-colors
        ${
          track && on(href)
            ? 'text-[#E8ECF0] bg-[var(--sf2)] shadow-[inset_1px_0_0_var(--acc)]'
            : 'text-[var(--dim)] hover:text-[var(--tx)] hover:bg-[var(--sf)]'
        }`}
    >
      {label}
    </Link>
  );

  return (
    <aside className="w-[188px] shrink-0 border-r border-[var(--line)] flex flex-col bg-[var(--bg)]">
      <div className="px-3 h-11 flex items-center gap-2 border-b border-[var(--line)] shrink-0">
        <span className="w-[7px] h-[7px] bg-[var(--acc)] rounded-[1px]"></span>
        <span className="text-[12.5px] font-semibold tracking-tight text-[#E8ECF0]">PitchQuant</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div className="space-y-px">
          {item('/', 'Dashboard')}
          {item('/calendar', 'Fixtures')}
          {item('/finder', 'Pattern Scanner')}
          {item('/team/Arsenal', 'Team Lab')}
          {item('/research', 'Match Research')}
          {item('/backtest', 'Backtest Lab')}
          {item('/lab', 'Pro Lab')}
          {item('/methodology', 'Methodology')}
          {item('/status', 'Status (internal)')}
        </div>

        <div>
          <p className="eyebrow px-2 mb-1">Market Research</p>
          <div className="space-y-px">
            {item('/odds', 'Find Your Odds')}
            {item('/explorer', 'Odds Explorer')}
            {item('/calibration', 'Calibration')}
          </div>
        </div>

        <div>
          <p className="eyebrow px-2 mb-1">Leagues</p>
          <div className="space-y-px">
            {LEAGUES.map((l) =>
              item(
                `/market/over-1.5?league=${l.id}`,
                <>
                  <LeagueBadge id={l.id} size={13} />
                  <span className="truncate">{l.name}</span>
                </>,
                false
              )
            )}
          </div>
        </div>

        <div>
          <p className="eyebrow px-2 mb-1">Markets</p>
          <div className="space-y-px">
            {MARKETS.map((m) => item(`/market/${m.id}`, m.name, false))}
          </div>
        </div>
      </nav>

      <div className="px-3 py-2.5 border-t border-[var(--line)] shrink-0">
        <UserChip />
      </div>
    </aside>
  );
}