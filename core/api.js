import { fetchWithTimeout, normalizeInterval, getCachedOHLCV, setCachedOHLCV } from './utils.js';

const API_BASE = '/api/birdeye';

export async function fetchTokenData(addr, chain) {
  const path = '/defi/token_overview';
  const params = new URLSearchParams({ address: addr, ui_amount_mode: 'scaled' });
  const url = `${API_BASE}?path=${path}&chain=${chain}&${params.toString()}`;
  const r = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 4500);
  if (!r.ok) throw new Error(`Birdeye ${chain}: ${r.status}`);
  const j = await r.json();
  const d = j?.data || {};
  const n = (a, b) => (a !== undefined ? a : b);
  return {
    ...d,
    price: n(d.price, d.price),
    liquidity: n(d.liquidity, d.liquidity),
    marketCap: n(d.market_cap, d.marketCap),
    fdv: n(d.fdv, d.fdv),
    v24hUSD: n(d.volume_24h_usd, d.v24hUSD),
    priceChange24hPercent: n(d.price_change_24h_percent, d.priceChange24hPercent),
    priceChange1hPercent: n(d.price_change_1h_percent, d.priceChange1hPercent),
    priceChange4hPercent: n(d.price_change_4h_percent, d.priceChange4hPercent),
    buy24h: n(d.buy_24h, d.buy24h),
    sell24h: n(d.sell_24h, d.sell24h),
    trade24h: n(d.trade_24h, d.trade24h),
    uniqueWallet24h: n(d.unique_wallet_24h, d.uniqueWallet24h),
    uniqueWallet24hChangePercent: n(d.unique_wallet_24h_change_percent, d.uniqueWallet24hChangePercent),
    holder: n(d.holder, d.holder),
    totalSupply: n(d.total_supply, d.totalSupply),
    numberMarkets: n(d.number_of_markets, d.numberMarkets),
    logoURI: n(d.logo_uri, d.logoURI),
    symbol: n(d.symbol, d.symbol),
    name: n(d.name, d.name),
  };
}

export async function fetchTokenOHLCV(addr, chain, interval = '1h', rangeHours = 48, useCache = true) {
  if (useCache) {
    const cached = getCachedOHLCV(addr, chain, interval, 60000);
    if (cached?.items?.length) return cached;
  }

  const SEC = { '1s':1,'15s':15,'30s':30,'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400 };
  const intSec = SEC[interval] || 3600;
  const maxHours = Math.floor((5000 * intSec) / 3600) || 1;
  const safeHours = Math.min(rangeHours, Math.max(1, maxHours));
  const now = Math.floor(Date.now() / 1000);
  const time_from = now - safeHours * 3600;

  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const url = new URL(base + `${API_BASE}`);
  url.searchParams.set('path', '/defi/v3/ohlcv');
  url.searchParams.set('chain', chain);
  url.searchParams.set('address', addr);
  url.searchParams.set('type', normalizeInterval(interval));
  url.searchParams.set('currency', 'usd');
  url.searchParams.set('ui_amount_mode', 'raw');
  url.searchParams.set('time_from', String(time_from));
  url.searchParams.set('time_to', String(now));

  const res = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } }, 8000);
  if (!res.ok) throw new Error('OHLCV ' + res.status);
  const j = await res.json();
  const data = j?.data || {};
  try { setCachedOHLCV(addr, chain, interval, data); } catch {}
  return data;
}
