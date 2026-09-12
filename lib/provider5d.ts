const BASE = 'https://api.5dollarfootballapi.com/v1';

export interface ProviderResponse<T> {
  data: T | null;
  remaining: number | null;
  error: string | null;
}

async function call<T>(path: string, params?: Record<string, string>): Promise<ProviderResponse<T>> {
  const key = process.env.FIVE_DOLLAR_API_KEY;
  if (!key) return { data: null, remaining: null, error: 'missing FIVE_DOLLAR_API_KEY' };
  const url = new URL(BASE + path);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${key}` }, cache: 'no-store' });
    const remRaw = res.headers.get('x-ratelimit-remaining');
    const remaining = remRaw == null ? null : Number(remRaw);
    if (res.status === 429) return { data: null, remaining, error: 'rate_limited' };
    if (!res.ok) return { data: null, remaining, error: `http_${res.status}` };
    const json = await res.json();
    if (!json?.success) return { data: null, remaining, error: json?.error?.message || 'api_error' };
    return { data: json.data as T, remaining, error: null };
  } catch (e: any) {
    return { data: null, remaining: null, error: e?.message || 'fetch_failed' };
  }
}

export const getScheduledFixtures = (perPage = 100) =>
  call<any[]>('/fixtures', { status: 'scheduled', per_page: String(perPage) });

export const getFinishedFixtures = (perPage = 100) =>
  call<any[]>('/fixtures', { status: 'finished', per_page: String(perPage) });

// Pro-only on your plan shape; gated behind ODDS_CAPTURE until parser is probed post-upgrade
export const getFixtureOdds = (id: string) => call<any>(`/fixtures/${id}/odds`);