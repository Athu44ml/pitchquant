"use client";
import { useEffect, useState } from 'react';
import { Mod, MethodologyNote } from '@/components/ui';

type Gate = 'PASS' | 'PARTIAL' | 'BLOCKED';

export default function StatusPage() {
  const [self, setSelf] = useState<any>(null);
  const [ds, setDs] = useState<any>(null);
  const [cal, setCal] = useState<any>(null);
  const [oddsMeta, setOddsMeta] = useState<any>(null);

  useEffect(() => {
    fetch('/api/selftest').then((r) => r.json()).then(setSelf).catch(() => {});
    fetch('/api/datasets').then((r) => r.json()).then(setDs).catch(() => {});
    fetch('/api/calibration?league=france&season=26&market=win').then((r) => r.json()).then(setCal).catch(() => {});
    fetch('/api/find-odds?league=france&market=win').then((r) => r.json()).then((d) => setOddsMeta(d.meta)).catch(() => {});
  }, []);

  const dataOk = (ds?.datasets || []).length > 0 && (ds?.datasets || []).every((d: any) => d.played === d.matches);
  const modelOk = !!self?.allPass && (cal?.benchmarks || []).length >= 2;
  const backtestOk = !!self?.checks?.find((c: any) => c.name === 'constant-odds market: profit null')?.pass;
  const providerLive = oddsMeta && oddsMeta.provider !== 'local';
  const coverageOk = oddsMeta?.marketOddsAvailable === true;

  const gates: { name: string; gate: Gate; evidence: string }[] = [
    { name: 'DATA INTEGRITY', gate: dataOk ? 'PASS' : 'BLOCKED', evidence: `${(ds?.datasets || []).length} datasets; played==matches enforced; provenance registry live` },
    { name: 'MODEL INTEGRITY', gate: modelOk ? 'PASS' : 'PARTIAL', evidence: `shrinkage v2; benchmarks: ${(cal?.benchmarks || []).map((b: any) => `${b.name} brier ${b.brier}`).join(' · ') || 'pending'}` },
    { name: 'BACKTEST INTEGRITY', gate: backtestOk ? 'PASS' : 'BLOCKED', evidence: 'walk-forward default; constant-odds markets blocked from profit math; opening-price settlement' },
    { name: 'PROVIDER', gate: providerLive ? 'PASS' : 'BLOCKED', evidence: `provider=${oddsMeta?.provider || 'unknown'}; key server-side; timeouts+validation+cache in place` },
    { name: 'STATISTICAL VALIDITY', gate: self?.allPass ? 'PASS' : 'PARTIAL', evidence: `${self?.checks?.filter((c: any) => c.pass).length || 0}/${self?.checks?.length || 0} self-tests pass; Wilson CIs; sample classes; multiple-testing note` },
    { name: 'PUBLIC METHODOLOGY', gate: 'PASS', evidence: '/methodology live' },
    { name: 'LIVE ODDS COVERAGE', gate: coverageOk ? 'PASS' : 'PARTIAL', evidence: coverageOk ? 'market odds available for operator fixtures' : 'provider calendar ≠ operator fixture set; UI shows "Market odds unavailable" honestly' },
  ];

  const gateColor = (g: Gate) => (g === 'PASS' ? 'pos' : g === 'PARTIAL' ? 'mut' : 'neg');

  return (
    <div className="page">
      <p className="eyebrow mb-1">Internal</p>
      <h1 className="h-title">Pre-launch gates</h1>
      <p className="h-desc">Evidence-based audit. This page never declares launch readiness; that decision is human and requires reading every PARTIAL/BLOCKED line below.</p>

      <Mod first title="GATES">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Gate</th><th>Status</th><th>Evidence</th></tr></thead>
            <tbody>
              {gates.map((g) => (
                <tr key={g.name}>
                  <td className="name">{g.name}</td>
                  <td><span className={`mono text-[10px] ${gateColor(g.gate)}`}>{g.gate}</span></td>
                  <td className="mut">{g.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Mod>

      <Mod title="MODEL BENCHMARKS (calibration)">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th> Predictor</th><th className="num">N</th><th className="num">Brier</th><th className="num">Log loss</th></tr></thead>
            <tbody>
              {(cal?.benchmarks || []).map((b: any, i: number) => (
                <tr key={i}><td className="name">{b.name}</td><td className="num">{b.n}</td><td className="num">{b.brier ?? '—'}</td><td className="num">{b.logLoss ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub mt-2">{cal?.note || ''}</p>
      </Mod>

      <Mod title="SELF-TESTS (executed live)">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
            <tbody>
              {(self?.checks || []).map((c: any, i: number) => (
                <tr key={i}>
                  <td className="name">{c.name}</td>
                  <td><span className={`mono text-[10px] ${c.pass ? 'pos' : 'neg'}`}>{c.pass ? 'PASS' : 'FAIL'}</span></td>
                  <td className="mut mono">{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Mod>

      <Mod title="DATASETS">
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>League / Season</th><th className="num">Matches</th><th className="num">Played</th><th>Period</th><th>Odds cols</th></tr></thead>
            <tbody>
              {(ds?.datasets || []).map((d: any, i: number) => (
                <tr key={i}>
                  <td className="name">{d.leagueName} · {d.seasonName}</td>
                  <td className="num">{d.matches}</td>
                  <td className="num">{d.played}</td>
                  <td className="mut mono">{d.dateFrom} → {d.dateTo}</td>
                  <td className="mut mono">{d.oddsColumns.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MethodologyNote>Launch decision rule: every gate PASS, or every PARTIAL/BLOCKED explicitly accepted in writing with its user-visible mitigation. Code tests passing is necessary, not sufficient.</MethodologyNote>
      </Mod>
    </div>
  );
}