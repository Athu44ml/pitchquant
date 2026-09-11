// Server-side odds provider abstraction. Keys never reach the browser.
export type Quote = { bookmaker: string; odds: number; point?: number; opening?: number };
export type ProviderFixture = {
  key: string; date: string; time: string; league: string; home: string; away: string;
  odds: Record<string, Record<string, Quote[]>>;
};
export interface OddsProvider {
  id: string;
  getUpcomingFixtures(league: string): Promise<ProviderFixture[]>;
  getBookmakers(): Promise<string[]>;
}

const g: any = globalThis;
if (!g.oddsCache) g.oddsCache = { time: 0, fetchedAt: 0, lastError: null as string | null, fixtures: {}, bookmakers: null, store: {} };
const CACHE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const validOdd = (x: any): x is number => typeof x === 'number' && isFinite(x) && x > 1 && x < 1000;

async function getJSON(url: string, headers?: Record<string, string>): Promise<{ json?: any; error?: string }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, cache: 'no-store', signal: ctl.signal });
    if (res.status === 429) return { error: 'rate_limited' };
    if (!res.ok) return { error: `http_${res.status}` };
    const json = await res.json();
    if (json && json.success === 0) return { error: 'api_rejected' };
    return { json };
  } catch (e: any) {
    return { error: e?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally { clearTimeout(t); }
}

const LEAGUE_KEYWORDS: Record<string, string[]> = {
  epl: ['premierleague'], spain: ['laliga'], italy: ['seriea'], germany: ['bundesliga'],
  france: ['ligue1'], netherlands: ['eredivisie'], belgium: ['proleague', 'jupiler', 'belgium'],
};

class FiveDollarProvider implements OddsProvider {
  id = '5dollarfootball';
  private base = 'https://api.5dollarfootballapi.com/v1';
  private key() { return process.env.FIVE_DOLLAR_API_KEY || ''; }
  private headers() { return { Authorization: `Bearer ${this.key()}` }; }

  private async dayRows(ts: number): Promise<any[]> {
    const k = `fd:${ts}`;
    if (g.oddsCache.store[k]) return g.oddsCache.store[k];
    let r = await getJSON(`${this.base}/fixtures?start_time=${ts}&end_time=${ts + 86400}&status=scheduled&include=odds&per_page=100`, this.headers());
    if (r.error) r = await getJSON(`${this.base}/fixtures?start_time=${ts}&end_time=${ts + 86400}&status=scheduled&per_page=100`, this.headers()); // free plan: no include=odds on lists
    if (r.error) { g.oddsCache.lastError = r.error; return []; }
    const rows = Array.isArray(r.json?.data) ? r.json.data : [];
    g.oddsCache.store[k] = rows;
    return rows;
  }

  private async fixtureOdds(id: number): Promise<any[]> {
    const k = `fdo:${id}`;
    if (g.oddsCache.store[k]) return g.oddsCache.store[k];
    const r = await getJSON(`${this.base}/fixtures/${id}/odds`, this.headers());
    if (r.error) { g.oddsCache.lastError = r.error; return []; }
    const books = Array.isArray(r.json?.data?.bookmakers) ? r.json.data.bookmakers : [];
    g.oddsCache.store[k] = books;
    return books;
  }

  private buildOdds(books: any[], home: string, away: string) {
    const odds: Record<string, Record<string, Quote[]>> = {};
    const push = (market: string, sel: string, q: Quote) => { ((odds[market] ||= {})[sel] ||= []).push(q); };
    for (const bm of books) {
      const o = bm?.odds || {};
      const name = String(bm.name || 'Bet 365');
      const x = o['1x2'];
      if (x) {
        const cur = x.closing || x.opening; const open = x.opening;
        if (validOdd(cur?.home)) push('win', norm(home), { bookmaker: name, odds: cur.home, opening: validOdd(open?.home) ? open.home : undefined });
        if (validOdd(cur?.draw)) push('win', 'draw', { bookmaker: name, odds: cur.draw, opening: validOdd(open?.draw) ? open.draw : undefined });
        if (validOdd(cur?.away)) push('win', norm(away), { bookmaker: name, odds: cur.away, opening: validOdd(open?.away) ? open.away : undefined });
      }
      const gl = o.goal_line;
      if (gl) {
        const cur = gl.closing || gl.opening; const open = gl.opening;
        if (validOdd(cur?.over)) push('total', 'over', { bookmaker: name, odds: cur.over, point: cur.line, opening: validOdd(open?.over) ? open.over : undefined });
        if (validOdd(cur?.under)) push('total', 'under', { bookmaker: name, odds: cur.under, point: cur.line, opening: validOdd(open?.under) ? open.under : undefined });
      }
      const bt = o.btts;
      if (bt) {
        const cur = bt.closing || bt.opening; const open = bt.opening;
        if (validOdd(cur?.yes)) push('btts', 'yes', { bookmaker: name, odds: cur.yes, opening: validOdd(open?.yes) ? open.yes : undefined });
        if (validOdd(cur?.no)) push('btts', 'no', { bookmaker: name, odds: cur.no, opening: validOdd(open?.no) ? open.no : undefined });
      }
    }
    return odds;
  }

  async getUpcomingFixtures(league: string): Promise<ProviderFixture[]> {
    const kws = LEAGUE_KEYWORDS[league] || [];
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const start = Math.floor(today.getTime() / 1000);
    const days = Number(process.env.ODDS_DAYS || 3);
    const out: ProviderFixture[] = [];
    const seen = new Set<string>();
    let perFixtureCalls = 0;
    for (let d = 0; d < days; d++) {
      for (const r of await this.dayRows(start + d * 86400)) {
        const home = r?.teams?.home?.name; const away = r?.teams?.away?.name;
        const lg = norm(r?.league?.name || '');
        const ko = String(r.kickoff_utc || '');
        const key = String(r.id || `${lg}|${norm(home)}|${norm(away)}|${ko}`);
        if (!home || !away || !ko || seen.has(key)) continue;
        if (kws.length && !kws.some((k) => lg.includes(k))) continue;
        seen.add(key);
        let books: any[] | null = r.odds ? [{ name: 'Bet 365', odds: r.odds }] : null;
        if (!books && perFixtureCalls < 15) { books = await this.fixtureOdds(r.id); perFixtureCalls++; }
        out.push({ key, date: ko.slice(0, 10), time: ko.slice(11, 16), league, home, away, odds: this.buildOdds(books || [], home, away) });
      }
    }
    return out;
  }

  async getBookmakers(): Promise<string[]> {
    if (g.oddsCache.bookmakers) return g.oddsCache.bookmakers;
    const r = await getJSON(`${this.base}/bookmakers`, this.headers());
    const list = Array.isArray(r.json?.data) ? r.json.data.map((b: any) => String(b.name)) : [];
    if (list.length) g.oddsCache.bookmakers = list;
    return list;
  }
}

class LocalProvider implements OddsProvider {
  id = 'local';
  async getUpcomingFixtures(): Promise<ProviderFixture[]> { return []; }
  async getBookmakers(): Promise<string[]> { return []; }
}

export function getProvider(): OddsProvider {
  return process.env.FIVE_DOLLAR_API_KEY ? new FiveDollarProvider() : new LocalProvider();
}

export async function getCachedUpcoming(league: string): Promise<ProviderFixture[]> {
  const now = Date.now();
  if (g.oddsCache.fixtures[league] && now - g.oddsCache.time < CACHE_MS) return g.oddsCache.fixtures[league];
  const fx = await getProvider().getUpcomingFixtures(league);
  g.oddsCache.fixtures[league] = fx;
  g.oddsCache.time = now;
  g.oddsCache.fetchedAt = now;
  return fx;
}

export async function getCachedBookmakers(): Promise<string[]> {
  if (g.oddsCache.bookmakers && Date.now() - g.oddsCache.time < CACHE_MS) return g.oddsCache.bookmakers;
  const b = await getProvider().getBookmakers();
  if (b.length) g.oddsCache.bookmakers = b;
  return b;
}

export function getProviderMeta() {
  return { id: getProvider().id, fetchedAt: g.oddsCache.fetchedAt || 0, lastError: g.oddsCache.lastError as string | null };
}