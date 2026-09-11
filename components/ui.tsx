import { classifySample, wilsonInterval, formatPct } from '@/lib/stats';

export function Metrics({ items }: { items: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' }[] }) {
  return (
    <div className="metrics">
      {items.map((it, i) => (
        <div key={i}>
          <p className="eyebrow">{it.label}</p>
          <p className={`v ${it.tone ? it.tone : ''}`}>{it.value}</p>
          {it.sub && <p className="s">{it.sub}</p>}
        </div>
      ))}
    </div>
  );
}

export function Mod({ title, right, children, first }: { title: string; right?: React.ReactNode; children: React.ReactNode; first?: boolean }) {
  return (
    <section className={first ? undefined : 'mod'}>
      <div className="mod-h"><span className="t">{title}</span>{right && <span className="sub">{right}</span>}</div>
      {children}
    </section>
  );
}

export function Readout({ items }: { items: { k: string; v: string; tone?: 'pos' | 'neg' }[] }) {
  return (
    <div className="readout">
      {items.map((it, i) => (
        <span className="i" key={i}>
          <span className="k">{it.k}</span>
          <span className={`v ${it.tone ? it.tone : ''}`}>{it.v}</span>
        </span>
      ))}
    </div>
  );
}

export function Bar({ v, max = 50 }: { v: number; max?: number }) {
  const w = Math.min(Math.abs(v) / max, 1) * 100;
  return (
    <span className="bar">
      <i style={{ width: `${w}%`, background: v >= 0 ? 'var(--acc)' : 'var(--neg)' }} />
    </span>
  );
}

export function ConfidenceBadge({ wins, n }: { wins: number; n: number }) {
  if (n === 0) return <span className="mut text-[10px] mono">NO DATA</span>;
  const { label, class: cls } = classifySample(n);
  const ci = wilsonInterval(wins, n);
  const winRate = wins / n;

  const color =
    cls === 'LARGE' ? 'text-[var(--tx)]' :
    cls === 'MODERATE' ? 'text-[var(--dim)]' :
    'text-[var(--faint)]';

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className={`mono text-[10.5px] ${color}`}>
        {formatPct(winRate)} <span className="mut">· N={n}</span>
      </span>
      <span className="text-[9.5px] text-[var(--faint)] mono" title="95% Wilson confidence interval for the observed win rate">
        CI {formatPct(ci.lower, 0)}–{formatPct(ci.upper, 0)} · {label}
      </span>
    </div>
  );
}

export function MethodologyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] text-[var(--faint)] italic mt-3 max-w-[60ch] leading-relaxed">
      <span className="font-semibold not-italic uppercase tracking-wider text-[9px] mr-1">Methodology:</span>
      {children}
    </p>
  );
}