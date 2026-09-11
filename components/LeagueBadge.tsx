"use client";
import { useEffect, useState } from 'react';

const META: Record<string, { abbr: string; hue: string }> = {
  epl: { abbr: 'PL', hue: '#4B7BC4' },
  spain: { abbr: 'LL', hue: '#C05062' },
  italy: { abbr: 'SA', hue: '#3E9B6D' },
  germany: { abbr: 'BL', hue: '#B98A2E' },
  france: { abbr: 'L1', hue: '#7A5FC0' },
  netherlands: { abbr: 'ED', hue: '#C0653B' },
  belgium: { abbr: 'BP', hue: '#B4558F' },
  portugal: { abbr: 'PRL', hue: '#3E8BA6' },
};

const mem: Record<string, string | null> = {};

export default function LeagueBadge({ id, size = 16 }: { id: string; size?: number }) {
  const [logo, setLogo] = useState<string | null | undefined>(mem[id]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (mem[id] !== undefined) { setLogo(mem[id]); return; }
    try {
      const ls = localStorage.getItem('leaguebadge:' + id);
      if (ls !== null) { mem[id] = ls || null; setLogo(ls || null); return; }
    } catch {}
    let on = true;
    fetch(`/api/league-logo?id=${id}`)
      .then((r) => r.json())
      .then((d) => {
        const url = d.badge || null;
        mem[id] = url;
        try { localStorage.setItem('leaguebadge:' + id, url || ''); } catch {}
        if (on) setLogo(url);
      })
      .catch(() => { mem[id] = null; if (on) setLogo(null); });
    return () => { on = false; };
  }, [id]);

  if (logo && !failed) {
    return <img src={logo} alt={id} onError={() => setFailed(true)} className="object-contain shrink-0" style={{ width: size, height: size }} />;
  }

  const m = META[id] || { abbr: id.slice(0, 2).toUpperCase(), hue: '#67758A' };
  return (
    <span
      className="inline-flex items-center justify-center rounded-[3px] font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5, background: `${m.hue}22`, color: m.hue, border: `1px solid ${m.hue}44` }}
    >
      {m.abbr}
    </span>
  );
}