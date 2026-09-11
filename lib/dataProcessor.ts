import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { LEAGUES, MARKETS } from './constants';

export function getSeasonData(leagueId: string, seasonId: string) {
  const league = LEAGUES.find((l) => l.id === leagueId);
  if (!league) return { teams: [], matches: [] };

  const withHyphen = path.join(process.cwd(), 'public', `${league.prefix}-${seasonId}.csv`);
  const withoutHyphen = path.join(process.cwd(), 'public', `${league.prefix}${seasonId}.csv`);

  let filePath = '';
  if (fs.existsSync(withHyphen)) filePath = withHyphen;
  else if (fs.existsSync(withoutHyphen)) filePath = withoutHyphen;
  else {
    console.error('❌ File not found:', `${league.prefix}-${seasonId}.csv`);
    return { teams: [], matches: [] };
  }

  try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    if (fileContent.charCodeAt(0) === 0xFEFF) fileContent = fileContent.slice(1);

    const parsed = Papa.parse(fileContent, { header: true, dynamicTyping: true, skipEmptyLines: true });
    const matches = (parsed.data as any[]).filter((m) => m.HomeTeam && m.AwayTeam);
    if (matches.length === 0) return { teams: [], matches: [] };

    const teams = Array.from(new Set(matches.flatMap((m: any) => [m.HomeTeam, m.AwayTeam]))).sort();
    return { teams, matches };
  } catch (error) {
    console.error('Parse error:', error);
    return { teams: [], matches: [] };
  }
}

// Did the bet win?
export function marketHit(match: any, marketId: string, isHome: boolean): boolean {
  const hg = Number(match.FTHG) || 0;
  const ag = Number(match.FTAG) || 0;
  const ftr = String(match.FTR) || '';

  if (marketId === 'over-1.5') return hg + ag >= 2;
  if (marketId === 'under-2.5') return hg + ag <= 2;
  if (marketId === 'btts') return hg > 0 && ag > 0;
  if (marketId === 'no-draw') return ftr === 'H' || ftr === 'A';
  if (marketId === 'win') return isHome ? ftr === 'H' : ftr === 'A';
  if (marketId === 'win-or-draw') return isHome ? (ftr === 'H' || ftr === 'D') : (ftr === 'A' || ftr === 'D');
  return false;
}

// Real bookmaker odds from the CSV (with smart fallbacks)
export function getOddsForMarket(match: any, marketId: string, isHome: boolean): number {
  const homeWin = Number(match.B365H) || Number(match.AvgH) || 0;
  const draw = Number(match.B365D) || Number(match.AvgD) || 0;
  const awayWin = Number(match.B365A) || Number(match.AvgA) || 0;
  const market = MARKETS.find((m) => m.id === marketId);
  const fallback = market?.defaultOdds || 1.5;

  if (marketId === 'under-2.5') return Number(match['B365<2.5']) || Number(match['Avg<2.5']) || fallback;
  if (marketId === 'win') return (isHome ? homeWin : awayWin) || fallback;
  if (marketId === 'win-or-draw') {
    const w = isHome ? homeWin : awayWin;
    if (w > 0 && draw > 0) return Number((1 / (1 / w + 1 / draw)).toFixed(2));
    return fallback;
  }
  if (marketId === 'no-draw') {
    const w = isHome ? homeWin : awayWin;
    const o = isHome ? awayWin : homeWin;
    if (w > 0 && o > 0) {
      const pW = 1 / w, pO = 1 / o;
      return Number(((pW + pO) / pW).toFixed(2));
    }
    return fallback;
  }
  return fallback; // over-1.5 & btts: not in CSVs
}

export function calculateTeamGraph(matches: any[], team: string, marketId: string, minOdds = 0, maxOdds = 999) {
  const teamMatches = matches.filter((m: any) => m.HomeTeam === team || m.AwayTeam === team);
  let cumulativeProfit = 0;
  const graphData: any[] = [];

  teamMatches.forEach((match: any) => {
    const isHome = match.HomeTeam === team;
    const odds = getOddsForMarket(match, marketId, isHome);
    if (odds < minOdds || odds > maxOdds) return;

    const hit = marketHit(match, marketId, isHome);
    const profit = hit ? 100 * odds - 100 : -100;
    cumulativeProfit += profit;

    graphData.push({
      matchweek: graphData.length + 1,
      opponent: isHome ? match.AwayTeam : match.HomeTeam,
      venue: isHome ? 'Home' : 'Away',
      odds: Number(odds.toFixed(2)),
      profit: Math.round(profit),
      cumulative: Math.round(cumulativeProfit),
      hit,
    });
  });

  return graphData;
}