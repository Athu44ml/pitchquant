import { NextResponse } from 'next/server';
import { matchProbs, marketProb } from '@/lib/model';
import { classifySample } from '@/lib/stats';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = q.get('league') || 'epl';
  const season = q.get('season') || '26';
  const home = q.get('home') || '';
  const away = q.get('away') || '';
  const market = q.get('market') || 'win';
  const side = q.get('side') || 'home';
  if (!home || !away) return NextResponse.json({ error: 'missing teams' }, { status: 400 });

  const probs = matchProbs(league, season, home, away);
  const prob = marketProb(probs, market, side);
  const n = Math.min(probs.nHome, probs.nAway);
  const cls = classifySample(n);

  return NextResponse.json({
    home, away, market, side, probs, prob,
    fairOdds: prob && prob > 0 ? +(1 / prob).toFixed(2) : null,
    confidence: { n, class: cls.class, label: cls.label },
  });
}