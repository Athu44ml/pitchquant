"use client";
import { useEffect, useState } from 'react';

const HUES = ['#B4434B', '#C0653B', '#B98A2E', '#3E9B6D', '#3E9B8F', '#4B7BC4', '#7A5FC0', '#B4558F', '#C05062', '#3E8BA6'];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const mem: Record<string, string | null> = {};

export default function Crest({ name, size = 20 }: { name: string; size?: number }) {
  const [logo, setLogo] = useState<string | null | undefined>(mem[name]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (mem[name] !== undefined) { setLogo(mem[name]); return; }
    try {
      const ls = localStorage.getItem('crest:' + name.toLowerCase());
      if (ls !== null) { mem[name] = ls || null; setLogo(ls || null); return; }
    } catch {}
    let on = true;
    fetch(`/api/team-logo?name=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((d) => {
        const url = d.badge || null;
        mem[name] = url;
        try { localStorage.setItem('crest:' + name.toLowerCase(), url || ''); } catch {}
        if (on) setLogo(url);
      })
      .catch(() => { mem[name] = null; if (on) setLogo(null); });
    return () => { on = false; };
  }, [name]);

  if (logo && !failed) {
    return <img src={logo} alt={name} onError={() => setFailed(true)} className="object-contain shrink-0" style={{ width: size, height: size }} />;
  }

  const hue = HUES[hash(name) % HUES.length];
  const initials =
    name.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() ||
    name.slice(0, 2).toUpperCase();

  return (
    <span
      className="inline-flex items-center justify-center rounded-[4px] font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.42, background: `${hue}22`, color: hue, border: `1px solid ${hue}44` }}
    >
      {initials}
    </span>
  );
}