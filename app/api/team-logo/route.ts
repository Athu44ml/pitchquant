import { NextResponse } from 'next/server';

const g: any = globalThis;
if (!g.logoCache) g.logoCache = {} as Record<string, string | null>;

export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get('name') || '';
  if (!name) return NextResponse.json({ badge: null });
  if (g.logoCache[name] !== undefined) return NextResponse.json({ badge: g.logoCache[name] });

  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(name)}`);
    if (!res.ok) { g.logoCache[name] = null; return NextResponse.json({ badge: null }); }
    const data = await res.json();
    const teams: any[] = data.teams || [];
    const lower = name.toLowerCase();
    const hit =
      teams.find((t) => String(t.strTeam || '').toLowerCase() === lower) ||
      teams.find((t) => {
        const tn = String(t.strTeam || '').toLowerCase();
        return tn.includes(lower) || lower.includes(tn);
      }) ||
      teams[0];
    const badge = hit?.strBadge || null;
    g.logoCache[name] = badge;
    return NextResponse.json({ badge });
  } catch {
    g.logoCache[name] = null;
    return NextResponse.json({ badge: null });
  }
}