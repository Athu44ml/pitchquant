import { Mod, MethodologyNote } from '@/components/ui';

export const metadata = { title: 'Methodology — PitchQuant' };

export default function MethodologyPage() {
  return (
    <div className="page">
      <p className="eyebrow mb-1">Public</p>
      <h1 className="h-title">Methodology</h1>
      <p className="h-desc">What this platform computes, from which data, and what it deliberately does not claim.</p>

      <Mod first title="Data sources">
        <p className="sub leading-relaxed">Historical results and bookmaker odds come from operator-uploaded football-data.co.uk CSVs (one file per league-season). Each dataset's period, match count and odds-column coverage are listed on the internal status page. Upcoming fixtures come from operator-uploaded fixture files and, where connected, from 5DollarFootballAPI (Bet365 prices). Current-season data is incomplete by definition and is never described as historical.</p>
      </Mod>

      <Mod title="Markets and odds basis">
        <p className="sub leading-relaxed">Markets with real bookmaker prices in the dataset (Match Winner, Under 2.5) support historical profit, ROI and backtests. Markets without bookmaker prices in the dataset (Over 1.5, BTTS, Win or Draw, No Draw) are classified RESULTS ONLY: hit rates are shown, historical profit and ROI are not computed, and they are never ranked alongside bookmaker-odds strategies. Model fair odds are never presented as bookmaker prices.</p>
      </Mod>

      <Mod title="Model">
        <p className="sub leading-relaxed">The internal model (xg-poisson-v2-shrunk) estimates pre-match probabilities from team attacking/defensive strength derived from expected goals where available, otherwise goals, with empirical-Bayes shrinkage toward league averages so thin samples regress to base rates. Every model output displays version, training period, sample size (evidence), mode (FULL pre-kickoff or ROLLING out-of-sample) and fair odds = 1 / probability. Historical simulations use only matches played before the fixture being predicted (walk-forward). Upcoming-match analysis may use all played matches.</p>
      </Mod>

      <Mod title="Implied probability, edge, CLV, ROI">
        <p className="sub leading-relaxed">Market implied probability = 1 / decimal odds (bookmaker margin not removed). Edge = model probability − implied probability; it is a descriptive research signal, not a profitability claim. Closing Line Value (CLV) = opening/closing − 1, computed only when both prices exist, and is always reported separately from ROI. ROI = net profit ÷ total staked. Positive CLV does not imply a profitable strategy.</p>
      </Mod>

      <Mod title="Backtesting">
        <p className="sub leading-relaxed">Backtests process matches chronologically, bet each fixture at most once, and price bets at opening (pre-match) odds. Three evaluation modes exist: WALK-FORWARD (default; qualification uses only pre-match information), OUT-OF-SAMPLE (train on the first half of the season, test on the second), and IN-SAMPLE (full-season qualification, look-ahead contaminated, labelled and never used for claims). Reported metrics: bets, staked, net profit, ROI, hit rate, average odds, max drawdown, longest losing and winning streaks, equity curve.</p>
      </Mod>

      <Mod title="Sample sizes and confidence">
        <p className="sub leading-relaxed">Evidence categories: N&lt;10 very small, 10–29 small, 30–99 moderate, 100+ large. Binary win rates are accompanied by Wilson 95% confidence intervals. High win rates on small samples are never described as strong, elite or confident. Pattern Scanner is exploratory: searching many team/market/odds combinations will surface impressive-looking patterns by chance alone; treat scans as hypotheses, not evidence.</p>
      </Mod>

      <Mod title="Calibration and benchmarks">
        <p className="sub leading-relaxed">The calibration page scores rolling pre-match predictions against actual outcomes by probability bucket, and reports Brier score and log loss for the model, a rolling league base-rate baseline, and raw bookmaker implied probabilities where real odds exist. No claim is made that the model beats bookmakers.</p>
      </Mod>

      <Mod title="Freshness, timezones, limitations">
        <p className="sub leading-relaxed">Provider odds carry a fetch timestamp; stale data is labelled. Provider kickoffs are UTC; CSV kickoffs are as-published with unspecified timezone and are never compared raw against provider timestamps. Limitations: incomplete current seasons, small early-season samples, bookmaker margin not removed from implied probabilities, fixture coverage dependent on operator files, and live-odds coverage dependent on provider plan. This platform is a research terminal: it reports historical evidence and model estimates, and makes no predictions of future results.</p>
        <MethodologyNote>Terminology used throughout: research, market, historical, model, evidence, sample, confidence, calibration, backtest, CLV, data freshness.</MethodologyNote>
      </Mod>
    </div>
  );
}