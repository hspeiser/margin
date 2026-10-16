import { COINGECKO_IDS, setRates } from '../engine';

const KEY = 'margin.rates.v1';
const MAX_AGE = 6 * 60 * 60 * 1000;

export interface RatesInfo {
  source: 'offline' | 'cached' | 'live';
  at?: number;
  error?: string;
}

interface Cached {
  at: number;
  rates: Record<string, number>;
}

function readCache(): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Cached | null;
    return c && c.rates && c.at ? c : null;
  } catch {
    return null;
  }
}

async function fetchJSON(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function fetchRates(): Promise<Record<string, number>> {
  const rates: Record<string, number> = {};
  const [fiat, crypto] = await Promise.allSettled([
    fetchJSON('https://open.er-api.com/v6/latest/USD'),
    fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${Object.values(COINGECKO_IDS).join(',')}&vs_currencies=usd`),
  ]);
  if (fiat.status === 'fulfilled') {
    const f = fiat.value as { rates?: Record<string, number> };
    Object.assign(rates, f.rates ?? {});
  }
  if (crypto.status === 'fulfilled') {
    const c = crypto.value as Record<string, { usd?: number }>;
    for (const [code, id] of Object.entries(COINGECKO_IDS)) {
      const usd = c[id]?.usd;
      if (usd) rates[code] = 1 / usd;
    }
  }
  if (!Object.keys(rates).length) throw new Error(fiat.status === 'rejected' ? String(fiat.reason) : 'No rates');
  return rates;
}

/** Load cached rates immediately, then refresh in the background if stale (or forced). */
export async function loadRates(onUpdate: (info: RatesInfo) => void, force = false): Promise<void> {
  const cached = readCache();
  if (cached) {
    setRates(cached.rates);
    onUpdate({ source: 'cached', at: cached.at });
    if (!force && Date.now() - cached.at < MAX_AGE) return;
  } else onUpdate({ source: 'offline' });
  try {
    const rates = await fetchRates();
    setRates(rates);
    const at = Date.now();
    try {
      localStorage.setItem(KEY, JSON.stringify({ at, rates }));
    } catch {
      /* storage full or unavailable: rates still apply for this session */
    }
    onUpdate({ source: 'live', at });
  } catch (e) {
    onUpdate({ source: cached ? 'cached' : 'offline', at: cached?.at, error: (e as Error).message });
  }
}
