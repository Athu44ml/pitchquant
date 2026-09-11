"use client";
import { useEffect, useState } from 'react';
import { LEAGUES, SEASONS } from '@/lib/constants';
import { Readout } from '@/components/ui';

type Col = { k: string; l: string; signed?: boolean; badge?: boolean };

const TOOLS: Record<string, { tab: string; title: string; blurb: string; cols: Col[] }> = {
  clv: { tab: 'CLV', title: 'Closing Line Value', blurb: 'Backing this team at opening odds versus the close. Positive CLV indicates pro-grade pricing.', cols: [{ k: 'team', l: 'Team' }, { k: 'matches', l: 'Bets' }, { k: 'avgClv', l: 'Avg CLV %', signed: true }, { k: 'beatClosePct', l: 'Beat close %' }] },
  truth: { tab: 'Odds Truth', title: 'Odds Bucket Truth', blurb: 'Realised hit rate versus implied probability per odds band. Negative edge is bookmaker margin.', cols: [{ k: 'bucket', l: 'Bucket' }, { k: 'n', l: 'Bets' }, { k: 'wins', l: 'Wins' }, { k: 'hitPct', l: 'Hit %' }, { k: 'impliedPct', l: 'Implied %' }, { k: 'edge', l: 'Edge', signed: true }, { k: 'roi', l: 'ROI %', signed: true }] },
  ah: { tab: 'Asian Hcp', title: 'Asian Handicap', blurb: 'Flat $100 on every team handicap line across the season. Pushes refunded.', cols: [{ k: 'team', l: 'Team' }, { k: 'covers', l: 'Covers' }, { k: 'pushes', l: 'Pushes' }, { k: 'losses', l: 'Losses' }, { k: 'coverPct', l: 'Cover %' }, { k: 'profit', l: 'P&L $', signed: true }, { k: 'roi', l: 'ROI %', signed: true }] },
  ht: { tab: 'Half-Time', title: 'Half-Time Behaviour', blurb: 'Persistence of half-time leads into full time.', cols: [{ k: 'team', l: 'Team' }, { k: 'leads', l: 'HT leads' }, { k: 'holdPct', l: 'Hold %' }, { k: 'blown', l: 'Blown' }, { k: 'over05htPct', l: 'O0.5 HT %' }, { k: 'htDrawPct', l: 'HT draw %' }] },
  corners: { tab: 'Corners-Cards', title: 'Corners & Cards', blurb: 'Set-piece and booking volume — thinly priced markets.', cols: [{ k: 'team', l: 'Team' }, { k: 'cf', l: 'C for' }, { k: 'ca', l: 'C against' }, { k: 'totalAvg', l: 'Total/m' }, { k: 'over95Pct', l: 'O9.5 %' }, { k: 'over105Pct', l: 'O10.5 %' }, { k: 'cardsAvg', l: 'Cards/m' }, { k: 'over45Pct', l: 'O4.5 %' }] },
  context: { tab: 'Context', title: 'Schedule Context', blurb: 'Kickoff slots and rest days — unpriced performance variance.', cols: [] },
  script: { tab: 'Game Scripts', title: 'Game Scripts', blurb: 'Comebacks, collapses and second-half goal splits.', cols: [{ k: 'team', l: 'Team' }, { k: 'comebacks', l: 'Comebacks' }, { k: 'collapses', l: 'Collapses' }, { k: 'htLeads', l: 'HT leads' }, { k: 'h2gf', l: '2H GF' }, { k: 'h2ga', l: '2H GA' }] },
  luck: { tab: 'Luck Index', title: 'Luck Index', blurb: 'Goal difference versus xG difference. Overperformers regress; underperformers revert upward.', cols: [{ k: 'team', l: 'Team' }, { k: 'n', l: 'Matches' }, { k: 'actDiff', l: 'Goal diff', signed: true }, { k: 'xgDiff', l: 'xG diff', signed: true }, { k: 'luck', l: 'Luck', signed: true }, { k: 'perMatch', l: 'Per match', signed: true }, { k: 'flag', l: 'Verdict', badge: true }] },
};

const SLOT_COLS: Col[] = [{ k: 'slot', l: 'Kickoff slot' }, { k: 'n', l: 'Matches' }, { k: 'homeWinPct', l: 'Home %' }, { k: 'drawPct', l: 'Draw %' }, { k: 'avgGoals', l: 'Avg goals' }, { k: 'over25Pct', l: 'O2.5 %' }, { k: 'bttsPct', l: 'BTTS %' }];
const REST_COLS: Col[] = [{ k: 'bucket', l: 'Rest' }, { k: 'n', l: 'Matches' }, { k: 'winPct', l: 'Win %' }, { k: 'gf', l: 'GF/m' }, { k: 'ga', l: 'GA/m' }];

const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);

function parts(tool: string, rows: any[], extra: any): { k: string; v: string; tone?: 'pos' | 'neg' }[] {
  if (!rows.length) return [{ k: 'status', v: 'no data' }];
  if (tool === 'clv') {
    const bets = sum(rows, 'matches');
    const clv = rows.reduce((a, r) => a + r.avgClv * r.matches, 0) / (bets || 1);
    const beat = rows.reduce((a, r) => a + r.beatClosePct * r.matches, 0) / (bets || 1);
    return [{ k: 'bets', v: String(bets) }, { k: 'avg CLV', v: `${clv >= 0 ? '+' : ''}${clv.toFixed(2)}%`, tone: clv >= 0 ? 'pos' : 'neg' }, { k: 'beat close', v: `${beat.toFixed(1)}%` }];
  }
  if (tool === 'truth') {
    const n = sum(rows, 'n');
    const roi = rows.reduce((a, r) => a + r.roi * r.n, 0) / (n || 1);
    return [{ k: 'bets', v: String(n) }, { k: 'flat ROI', v: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`, tone: roi >= 0 ? 'pos' : 'neg' }, { k: 'buckets', v: String(rows.length) }];
  }
  if (tool === 'ah') {
    const dec = sum(rows, 'covers') + sum(rows, 'losses');
    const p = sum(rows, 'profit');
    return [{ k: 'settled', v: String(dec) }, { k: 'cover', v: `${((sum(rows, 'covers') / (dec || 1)) * 100).toFixed(1)}%` }, { k: 'P&L', v: `${p >= 0 ? '+' : '−'}$${Math.abs(p)}`, tone: p >= 0 ? 'pos' : 'neg' }];
  }
  if (tool === 'luck') return [{ k: 'teams', v: String(rows.length) }, { k: 'matches', v: String(sum(rows, 'n')) }, { k: 'basis', v: 'xG' }];
  if (tool === 'context') return [{ k: 'matches', v: String(sum(rows, 'n')) }, { k: 'rest buckets', v: String(extra?.length || 0) }];
  return [{ k: 'teams', v: String(rows.length) }];
}

function Cell({ col, row }: { col: Col; row: any }) {
  const v = row[col.k];
  if (col.badge) return <span className={`mono text-[10px] uppercase tracking-wider ${String(v).includes('FADE') ? 'neg' : String(v).includes('BACK') ? 'pos' : 'mut'}`}>{v}</span>;
  if (col.signed && typeof v === 'number') return <span className={v > 0 ? 'pos' : v < 0 ? 'neg' : ''}>{v > 0 ? '+' : ''}{v}</span>;
  return <>{v}</>;
}

function Table({ cols, rows }: { cols: Col[]; rows: any[] }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr>{cols.map((c, i) => <th key={c.k} className={c.badge ? '' : i > 0 ? 'num' : ''}>{c.l}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {cols.map((c, j) => (
                <td key={c.k} className={`${c.badge ? '' : j > 0 ? 'num' : 'name'}`}><Cell col={c} row={row} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LabPage() {
  const [tool, setTool] = useState('clv');
  const [league, setLeague] = useState('epl');
  const [season, setSeason] = useState('26');
  const [rows, setRows] = useState<any[]>([]);
  const [extra, setExtra] = useState<any[]>([]);
  const [noXg, setNoXg] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/lab?tool=${tool}&league=${league}&season=${season}`);
        const data = await res.json();
        if (!cancelled) { setRows(data.rows || []); setExtra(data.extra || []); setNoXg(!!data.noXg); }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [tool, league, season]);

  const t = TOOLS[tool];

  return (
    <div className="page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Pro Lab</p>
          <h1 className="h-title">{t.title}</h1>
          <p className="h-desc">{t.blurb}</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={league} onChange={(e) => setLeague(e.target.value)} className="select-input">{LEAGUES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
          <select value={season} onChange={(e) => setSeason(e.target.value)} className="select-input">{SEASONS.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          {loading && <span className="sub">loading…</span>}
        </div>
      </div>

      <div className="mod" style={{ marginTop: 14 }}>
        <Readout items={parts(tool, rows, extra)} />
      </div>

      <div className="tabs mt-4">
        {Object.entries(TOOLS).map(([id, cfg]) => (
          <button key={id} onClick={() => setTool(id)} className={`mod-tab ${tool === id ? 'on' : ''}`}>{cfg.tab}</button>
        ))}
      </div>

      <div className="mt-4">
        {noXg ? <p className="sub py-8">No xG columns in this season's CSV. The Luck Index requires 2026/27 files (HxG / AxG).</p>
          : rows.length === 0 ? <p className="sub py-8">No data for this selection.</p>
          : tool === 'context' ? (
            <div className="space-y-6">
              <div><p className="eyebrow mb-2">By kickoff slot</p><Table cols={SLOT_COLS} rows={rows} /></div>
              <div><p className="eyebrow mb-2">By rest days</p><Table cols={REST_COLS} rows={extra} /></div>
            </div>
          ) : <Table cols={t.cols} rows={rows} />}
      </div>

      <p className="sub mt-4">Sample sizes per row. Early-season samples (&lt;10 matches) are indicative only.</p>
    </div>
  );
}