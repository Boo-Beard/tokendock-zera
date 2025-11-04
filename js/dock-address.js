// Works on tokendock-zera.vercel.app (=> /api/birdeye)
// and on www.tokendock.io/docks/zera/ (=> /docks/zera/api/birdeye)
const API_BASE = (() => {
  try {
    const m = location.pathname.match(/^\/docks\/[^/]+/);
    return (m ? `${m[0]}/api/birdeye` : '/api/birdeye');
  } catch {
    return '/api/birdeye';
  }
})();
const SUPPORTED_CHAINS = [
  "solana", "ethereum", "bsc", "base", "arbitrum", "polygon", "optimism", "avalanche", "sui"
];

function getCfg() {
  try { return window.TOKEN_DOCK_CONFIG || {}; } catch { return {}; }
}

function getAddress() {
  const cfg = getCfg();
  const fromConfig = cfg?.token?.address?.trim();
  if (fromConfig) return fromConfig;

  // Fallbacks: First try to get ?address= param (old style)
  const p = new URLSearchParams(location.search);
  let addr = p.get("address")?.trim();

  // If not found, extract from pathname (new /docks/:address style)
  if (!addr) {
    const parts = location.pathname.split("/");
    addr = parts.pop() || parts.pop(); // handle possible trailing slash
  }

  return addr || "";
}



function formatUSD(n) {
  if (!n || isNaN(n)) return "$0";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + Number(n).toFixed(2);
}

function formatPct(x) {
  return `${x > 0 ? '+' : ''}${Number(x || 0).toFixed(2)}%`;
}

// (native price will use formatTokenPrice as well)

// Smarter decimals for token price stat
function formatTokenPrice(n) {
  const v = Number(n);
  if (!isFinite(v) || v <= 0) return '$0.00';
  if (v >= 0.1) return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (v >= 0.01) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 3 });
  return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function getChainInfo(chain, addr) {
  const map = {
    solana: { name: " ", url: `https://solscan.io/token/${addr}`, icon: "solana" },
    ethereum: { name: "", url: `https://etherscan.io/token/${addr}`, icon: "ethereum" },
    bsc: { name: "", url: `https://bscscan.com/token/${addr}`, icon: "bsc" },
    base: { name: "", url: `https://basescan.org/token/${addr}`, icon: "base" },
    polygon: { name: "MATIC", url: `https://polygonscan.com/token/${addr}`, icon: "polygon" },
    arbitrum: { name: "ARB", url: `https://arbiscan.io/token/${addr}`, icon: "arbitrum" },
    optimism: { name: "OP", url: `https://optimistic.etherscan.io/token/${addr}`, icon: "optimism" },
    avalanche: { name: "AVAX", url: `https://snowtrace.io/token/${addr}`, icon: "avalanche" },
    sui: { name: "SUI", url: `https://suiscan.xyz/mainnet/coin/${addr}`, icon: "sui" },
  };
  return map[chain?.toLowerCase()] || map.solana;
}

// Chain icon URL mapping for fallback <img>
function getChainIconUrl(iconKey) {
  const map = {
    solana: 'https://unpkg.com/simple-icons@latest/icons/solana.svg',
    ethereum: 'https://unpkg.com/simple-icons@latest/icons/ethereum.svg',
    bsc: 'https://unpkg.com/simple-icons@latest/icons/binance.svg',
    sui: 'https://unpkg.com/simple-icons@latest/icons/sui.svg',
  };
  return map[iconKey] || '';
}

function ensureChainIconVisible(container) {
  try {
    const el = container.querySelector?.('.chain-icon');
    if (!el) return;
    const key = el.getAttribute('data-chain');
    // For chains using solid colored circle, no fallback needed
    if (!key || ['base','arbitrum','polygon','optimism','avalanche'].includes(key)) return;

    const supportsMask = CSS && (CSS.supports?.('-webkit-mask-image','url("")') || CSS.supports?.('mask-image','url("")'));
    if (supportsMask) return; // browser should render masked span

    const url = getChainIconUrl(key);
    if (!url) return;
    const img = new Image();
    img.width = 16; img.height = 16; img.alt = key + ' icon'; img.decoding = 'async';
    img.style.display = 'inline-block'; img.style.verticalAlign = 'middle'; img.style.borderRadius = '2px';
    img.onload = () => { try { el.replaceWith(img); } catch {} };
    img.onerror = () => {};
    img.src = url;
  } catch {}
}
function getExternalLinks(chain, addr) {
  const c = (chain || '').toLowerCase();
  const dex = `https://dexscreener.com/${c}/${addr}`;
  const bird = `https://www.birdeye.so/token/${addr}?chain=${c}`;
  return { dex, bird };
}
function getChainFromURL() {
  const cfg = getCfg();
  const fromConfig = cfg?.token?.chain?.toLowerCase();
  if (fromConfig) return fromConfig;
  const p = new URLSearchParams(location.search);
  return p.get("chain")?.toLowerCase() || "";
}

// Lightweight skeleton shimmer for initial load
function skeletonHTML() {
  return `
  <div class="stats-card skeleton">
    <div class="stats-header">
      <div class="stats-title" style="gap:8px;">
        <span class="shimmer circle"></span>
        <span class="shimmer line" style="width:120px"></span>
        <span class="shimmer line sm" style="width:90px"></span>
      </div>
    </div>
    <div class="chain-badge is-static" style="gap:6px;">
      <span class="shimmer circle"></span>
      <span class="shimmer line sm" style="width:50px"></span>
    </div>
    <div class="stats-grid">
      <div class="stat"><div class="shimmer tile"></div></div>
      <div class="stat"><div class="shimmer tile"></div></div>
      <div class="stat"><div class="shimmer tile"></div></div>
      <div class="stat"><div class="shimmer tile"></div></div>
    </div>
    <div class="shimmer pill" style="width:110px"></div>
    <div class="chart-panel" style="margin-top:12px;">
      <div class="shimmer" style="height:180px; border-radius:10px;"></div>
    </div>
  </div>`;
}

/* Timeout + abort for fetch */
function fetchWithTimeout(url, options = {}, ms = 6000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

/* Simple session cache */
function cacheSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch {} }
function cacheGet(k, maxAgeMs = 120000) {
  try {
    const raw = sessionStorage.getItem(k); if (!raw) return null;
    const obj = JSON.parse(raw); if (!obj || Date.now() - obj.t > maxAgeMs) return null;
    return obj.v;
  } catch { return null; }
}

/* Promise.any polyfill (first fulfill) */
function promiseAny(promises) {
  if (Promise.any) return Promise.any(promises);
  return new Promise((resolve, reject) => {
    let rejections = 0, n = promises.length;
    const errors = new Array(n);
    promises.forEach((p, i) => {
      Promise.resolve(p).then(resolve, e => {
        errors[i] = e;
        if (++rejections === n) reject(errors);
      });
    });
  });
}

async function fetchTokenData(addr, chain) {
  const path = "/defi/token_overview"; // ✅ v3 removed (works across all chains)
  const params = new URLSearchParams({
    address: addr,
    ui_amount_mode: "scaled",
  });

  const url = `${API_BASE}?path=${path}&chain=${chain}&${params.toString()}`;
  const r = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 4500);

  if (!r.ok) throw new Error(`Birdeye ${chain}: ${r.status}`);
  const j = await r.json();
  const d = j?.data || {};

  // ✅ normalize both snake_case & camelCase
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


/* === OHLCV cache helpers (short TTL to smooth toggles) === */
function ohlcvCacheKey(addr, chain, interval) {
  return `td_ohlcv_${chain}_${addr}_${interval}`;
}
function getCachedOHLCV(addr, chain, interval, ttlMs = 60000) {
  return cacheGet(ohlcvCacheKey(addr, chain, interval), ttlMs);
}
function setCachedOHLCV(addr, chain, interval, data) {
  cacheSet(ohlcvCacheKey(addr, chain, interval), data);
}

/* === OHLCV (token) with correct time params + range cap === */
function normalizeInterval(intv) {
  const map = {
    '1m': '1m','5m':'5m','15m':'15m','30m':'30m',
    '1h':'1H','4h':'4H','1d':'1D',
    '1s':'1s','15s':'15s','30s':'30s',
  };
  return map[intv] || intv;
}

async function fetchTokenOHLCV(addr, chain, interval = '1h', rangeHours = 48, useCache = true) {
  if (useCache) {
    const cached = getCachedOHLCV(addr, chain, interval, 60000);
    if (cached?.items?.length) return cached;
  }

  const SEC = {
    '1s': 1, '15s': 15, '30s': 30,
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '4h': 14400, '1d': 86400,
  };
  const intSec = SEC[interval] || 3600;

  const maxHours = Math.floor((5000 * intSec) / 3600) || 1;
  const safeHours = Math.min(rangeHours, Math.max(1, maxHours));

  const now = Math.floor(Date.now() / 1000);
  const time_from = now - safeHours * 3600;

const origin = (typeof window !== 'undefined' ? window.location.origin : 'https://www.tokendock.io');
const url = new URL(API_BASE, origin);  // keeps /docks/zera prefix when mounted
url.searchParams.set("path", "/defi/v3/ohlcv");
url.searchParams.set("chain", chain);
url.searchParams.set("address", addr);
url.searchParams.set("type", normalizeInterval(interval));
url.searchParams.set("currency", "usd");
url.searchParams.set("ui_amount_mode", "raw");
url.searchParams.set("time_from", String(time_from));
url.searchParams.set("time_to", String(now));

const res = await fetchWithTimeout(url.toString(), { headers: { Accept: "application/json" } }, 8000);


  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn('OHLCV request failed', res.status, url.toString(), body);
    throw new Error('OHLCV ' + res.status);
  }

  const j = await res.json();
  const data = j?.data || {};
  try { setCachedOHLCV(addr, chain, interval, data); } catch {}
  return data;
}

/* === Chart helpers (lightweight-charts) === */
function chartOptionsTheme() {
  const theme = (getCfg()?.chartTheme) || {};
  return {
    layout: {
      background: { type: 'solid', color: theme.backgroundColor || 'transparent' },
      textColor: theme.textColor || 'rgba(142,161,180,0.18)',
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: theme.gridColor || 'transparent' },
      horzLines: { color: theme.gridColor || 'transparent' },
    },
    crosshair: {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: { color: theme.crosshairColor || 'rgba(79,183,243,0.25)', width: 1, style: 1 },
      horzLine: { color: (theme.crosshairColor || 'rgba(79,183,243,0.25)').replace('0.25','0.20'), width: 1, style: 1 },
    },
    timeScale: {
      borderColor: 'transparent',
      rightOffset: 8,
      barSpacing: 6,
      fixLeftEdge: false,
      fixRightEdge: false,
    },
    rightPriceScale: {
      borderColor: 'transparent',
      scaleMargins: { top: 0.2, bottom: 0.25 },
    },
    localization: {
      priceFormatter: p => '$' + Number(p).toFixed(6),
    },
    handleScroll: {
      mouseWheel: true,
      pressedMouseMove: true,
      vertTouchDrag: true,
    },
    handleScale: {
      axisPressedMouseMove: true,
      mouseWheel: true,
      pinch: true,
    },
  };
}

function initChart(container) {
  const theme = (getCfg()?.chartTheme) || {};
  const chart = LightweightCharts.createChart(container, chartOptionsTheme());
  const candleSeries = chart.addCandlestickSeries({
    upColor: theme.upColor || 'rgba(14,180,102,0.35)',
    downColor: theme.downColor || 'rgba(230,57,70,0.35)',
    borderUpColor: theme.borderUpColor || '#17D77E',
    borderDownColor: theme.borderDownColor || '#FF4B5C',
    wickUpColor: theme.wickUpColor || 'rgba(23,215,126,0.9)',
    wickDownColor: theme.wickDownColor || 'rgba(255,75,92,0.9)',
  });

  // (Removed keyboard shortcuts per request)
  const volumeSeries = chart.addHistogramSeries({
    priceScaleId: '',
    priceFormat: { type: 'volume' },
    base: 0,
    color: theme.volumeColor || 'rgba(142,161,180,0.35)',
    scaleMargins: { top: 0.8, bottom: 0 },
  });
  chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

  const ema20Series = chart.addLineSeries({
    color: theme.ema20Color || '#4FB7F3',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
  });
  const ema50Series = chart.addLineSeries({
    color: theme.ema50Color || '#B084F7',
    lineWidth: 2,
    priceLineVisible: false,
    lastValueVisible: true,
  });

  return { chart, candleSeries, volumeSeries, ema20Series, ema50Series };
}

function computeEMA(candles, period) {
  const out = [];
  if (!candles.length) return out;
  const k = 2 / (period + 1);
  let prev = candles[0].close;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i].close;
    const val = i === 0 ? c : (c - prev) * k + prev;
    out.push({ time: candles[i].time, value: val });
    prev = val;
  }
  return out;
}

// 24h realized volatility from 1h closes (annualized)
function computeRealizedVolFromCandles(candles) {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const closes = candles.map(c => Number(c.close)).filter(x => isFinite(x) && x > 0);
  if (closes.length < 2) return null;

  const n = Math.min(closes.length, 25);
  const slice = closes.slice(-n);
  const rets = [];
  for (let i = 1; i < slice.length; i++) {
    const r = Math.log(slice[i] / slice[i - 1]);
    if (isFinite(r)) rets.push(r);
  }
  if (rets.length < 2) return null;

  const mean = rets.reduce((a,b)=>a+b,0) / rets.length;
  const varSum = rets.reduce((a,b)=>a + (b-mean)*(b-mean), 0) / (rets.length - 1);
  const stdev = Math.sqrt(Math.max(0, varSum));
  const annualized = stdev * Math.sqrt(24 * 365);
  return annualized;
}

// Heikin-Ashi transform
function toHeikinAshi(candles) {
  if (!candles.length) return [];
  const ha = [];
  let prevHA = {
    open: candles[0].open,
    close: (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4
  };
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = (prevHA.open + prevHA.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    ha.push({ time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
    prevHA = { open: haOpen, close: haClose };
  }
  return ha;
}

function renderOHLCV(candleSeries, volumeSeries, items, ema20Series, ema50Series, useHA = false, chartRef = null, intervalSecs = 3600) {
  const baseCandles = [];
  const volumes = [];
  for (const k of (items || [])) {
    const t = Number(k.unix_time);
    const o = Number(k.o), h = Number(k.h), l = Number(k.l), c = Number(k.c);
    const vUsd = Number(k.v_usd || 0);
    baseCandles.push({ time: t, open: o, high: h, low: l, close: c });
    volumes.push({ time: t, value: vUsd, color: (c >= o) ? 'rgba(14,180,102,0.7)' : 'rgba(230,57,70,0.7)' });
  }

  const candles = useHA ? toHeikinAshi(baseCandles) : baseCandles;

  candleSeries.setData(candles);
  volumeSeries.setData(volumes);

  const ema20 = computeEMA(baseCandles, 20);
  const ema50 = computeEMA(baseCandles, 50);
  if (ema20Series) ema20Series.setData(ema20);
  if (ema50Series) ema50Series.setData(ema50);

  if (chartRef && candles.length) {
    const SHOW = Math.min(150, candles.length);
    const last = candles[candles.length - 1].time;
    const span = SHOW * intervalSecs;
    const from = last - span;
    try {
      chartRef.timeScale().setVisibleRange({ from, to: last });
    } catch {
      chartRef.timeScale().fitContent();
    }
  }
}

/* Rendering extracted so we can reuse with cache and fresh loads */
function renderDock(t, detectedChain) {
  const c = document.getElementById("statsContainer");
  const mission = document.getElementById("projectMission");
  const socialsContainer = document.getElementById("socialLinks");

  const addr = getAddress();
  const chain = (t.chain || detectedChain || "solana").toLowerCase();
  const cfg = getCfg();
  const logo = (cfg?.branding?.logoUrl) || t.logoURI || t.logo_uri || "https://placehold.co/70x70/2AABEE/FFFFFF?text=?";
  const ch = Number(t.priceChange24hPercent || t.price_change_24h_percent || 0);
  const chClass = ch > 0 ? "up" : ch < 0 ? "down" : "";
  const apiSocials = t.extensions || {};
  const cfgSocials = cfg?.socials || {};
  const socials = { ...apiSocials, ...cfgSocials };

  document.getElementById("projectLogo").src = logo;
  document.getElementById("projectName").textContent = t.symbol || t.name || "Unknown";

  if (typeof cfg?.mission === 'string' && cfg.mission.trim().length) {
    mission.textContent = cfg.mission;
    mission.style.display = "block";
  } else {
    mission.style.display = "none";
  }
  const links = [];
  if (socials.twitter) links.push(`<a href="${socials.twitter}" target="_blank" class="social-link"><i class="fab fa-twitter"></i></a>`);
  if (socials.telegram) links.push(`<a href="${socials.telegram}" target="_blank" class="social-link"><i class="fab fa-telegram"></i></a>`);
  if (socials.website) links.push(`<a href="${socials.website}" target="_blank" class="social-link"><i class="fa-solid fa-desktop"></i></a>`);
  if (socials.medium) links.push(`<a href="${socials.medium}" target="_blank" class="social-link"><i class="fab fa-medium"></i></a>`);
  if (socials.github) links.push(`<a href="${socials.github}" target="_blank" class="social-link"><i class="fab fa-github"></i></a>`);
  if (socials.instagram) links.push(`<a href="${socials.instagram}" target="_blank" class="social-link"><i class="fab fa-instagram"></i></a>`);
  socialsContainer.innerHTML = links.join("");
  socialsContainer.style.display = links.length > 0 ? "flex" : "none";

  const chainInfo = getChainInfo(chain, addr);
  const { dex, bird } = getExternalLinks(chain, addr);

  let tradeUrl = "";
  switch (chain) {
    case "solana": tradeUrl = `https://raydium.io/swap/?inputMint=${addr}`; break;
    case "ethereum": tradeUrl = `https://app.uniswap.org/swap?inputCurrency=${addr}&chain=mainnet`; break;
    case "bsc": tradeUrl = `https://pancakeswap.finance/swap?inputCurrency=${addr}`; break;
    case "base": tradeUrl = `https://app.uniswap.org/swap?inputCurrency=${addr}&chain=base`; break;
    case "arbitrum": tradeUrl = `https://app.uniswap.org/swap?inputCurrency=${addr}&chain=arbitrum`; break;
    case "polygon": tradeUrl = `https://app.uniswap.org/swap?inputCurrency=${addr}&chain=polygon`; break;
    case "optimism": tradeUrl = `https://app.uniswap.org/swap?inputCurrency=${addr}&chain=optimism`; break;
    case "avalanche": tradeUrl = `https://traderjoexyz.com/trade?inputCurrency=${addr}`; break;
    case "sui": tradeUrl = `https://app.turbos.finance/swap?inputCoin=${addr}`; break;
    default: tradeUrl = `https://raydium.io/swap/?inputMint=${addr}`;
  }

  const buys = Number(t.buy24h ?? 0);
  const sells = Number(t.sell24h ?? 0);
  const total = buys + sells;
  let buyPercent = total ? Math.round((buys / total) * 100) : 50;
  let sellPercent = 100 - buyPercent;
  if (!isFinite(buyPercent) || buyPercent < 0) buyPercent = 50;
  if (!isFinite(sellPercent) || sellPercent < 0) sellPercent = 50;

  const cls = (v, th = 0) => (v > th ? 'up' : v < th ? 'down' : '');

  const priceMomentumScore =
    0.5 * (t.priceChange1hPercent || 0) +
    0.3 * (t.priceChange4hPercent || 0) +
    0.2 * (t.priceChange24hPercent || 0);

  let turnoverRatio = null;

  const buySellImbalancePct = (buys + sells) > 0
    ? ((buys - sells) / (buys + sells)) * 100
    : null;

  const avgTradeSize =
    (t.v24hUSD || 0) / Math.max(1, t.trade24h || 0);

  // Market Cap display logic: allow manual circulating supply override and optional FDV hide
  const manualCircEnabled = !!(cfg?.token?.useManualCirculatingSupply);
  const manualCirc = Number(cfg?.token?.circulatingSupply);
  let marketCapDisplay = Number(t.marketCap || 0);
  if (manualCircEnabled && isFinite(manualCirc) && manualCirc > 0 && isFinite(Number(t.price))) {
    marketCapDisplay = manualCirc * Number(t.price);
  }
  turnoverRatio = (marketCapDisplay > 0 && t.v24hUSD >= 0) ? (t.v24hUSD / marketCapDisplay) : null;
  const hideFDV = !!(cfg?.token?.hideFDV);
  const liqUtil = (t.v24hUSD && t.liquidity) ? (t.v24hUSD / t.liquidity) : null;
  const lastTradeAgoSec = t.lastTradeUnixTime ? (Math.max(0, Math.floor(Date.now()/1000 - Number(t.lastTradeUnixTime)))) : null;
  const fmtAgo = (s) => {
    if (!isFinite(s) || s <= 0) return 'just now';
    const m = Math.floor(s/60), h = Math.floor(m/60), d = Math.floor(h/24);
    if (d>0) return `${d}d ago`;
    if (h>0) return `${h}h ago`;
    if (m>0) return `${m}m ago`;
    return `${s}s ago`;
  };
  // Precompute advanced metric display strings/html to avoid nested template parsing
  const buyVolShareText = (() => {
    const num = Number(t.vBuy24hUSD || 0), den = Number(t.v24hUSD || 0);
    return den > 0 ? Math.round((num / den) * 100) + '%' : '—';
  })();

  // Verified badge config
  const verified = !!(cfg?.token?.verified);
  const vLabel = (cfg?.token?.verifiedLabel || 'Verified');
  const vInfo = (cfg?.token?.verifiedInfo || '');
  const vLink = (cfg?.token?.verifiedLink || '');
  const vStyle = (cfg?.token?.verifiedStyle || 'corner'); // 'corner' | 'pill' | 'inline'
  const vPulse = (cfg?.token?.verifiedPulse !== false);
  const verifiedCornerHtml = verified && vStyle === 'corner'
    ? ('<div class="verified-corner"' + (vInfo ? (' title="' + vInfo.replace(/"/g,'&quot;') + '"') : '') + '>'
        + '<i class="fa-solid fa-check"></i>'
        + (vLink ? (' <a class="badge-link" href="' + vLink + '" target="_blank" rel="noopener">' + vLabel + '</a>') : (' ' + vLabel))
      + '</div>')
    : '';
  const verifiedPillHtml = verified && vStyle === 'pill'
    ? (function(){
        const infoText = (vInfo && vInfo.trim().length) ? vInfo : 'This token is verified.';
        return '<span class="verified-badge ' + (vPulse ? 'pulsing' : '') + '">' +
                 '<i class="fa-solid fa-check" aria-hidden="true"></i>' +
                 (vLink
                   ? ('<a class="badge-link" href="' + vLink + '" target="_blank" rel="noopener">' + vLabel + '</a>')
                   : vLabel
                 ) +
                 ' <i class="fa-solid fa-circle-info info-icon" data-info="' + infoText.replace(/"/g,'&quot;') + '"></i>' +
               '</span>';
      })()
    : '';
  const verifiedInlineHtml = verified && vStyle === 'inline'
    ? (function(){
        const infoText = (vInfo && vInfo.trim().length) ? vInfo : 'This token has been Verified';
        return '<span class="verified-inline" style="display:inline-flex;align-items:center;">'
             + '<i class="fa-solid fa-circle-check info-icon" style="color: var(--verified-color, #17D77E); font-size:0.7em; margin-left:-6px;" data-info="' + infoText.replace(/"/g,'&quot;') + '" aria-label="Verified" role="img"></i>'
             + '</span>';
      })()
    : '';
  const verifiedNameAddon = (vStyle === 'pill') ? verifiedPillHtml : (vStyle === 'inline' ? verifiedInlineHtml : '');
  const mcLiqText = (() => {
    const liq = Number(t.liquidity || 0);
    return (liq > 0 && isFinite(marketCapDisplay)) ? (marketCapDisplay / liq).toFixed(2) + 'x' : '—';
  })();
  const momentumHeatmapHtml = (() => {
    const cells = [
      { k: '1h', v: Number(t.priceChange1hPercent || 0) },
      { k: '2h', v: Number(t.priceChange2hPercent || 0) },
      { k: '4h', v: Number(t.priceChange4hPercent || 0) },
      { k: '6h', v: Number(t.priceChange6hPercent || 0) },
      { k: '12h', v: Number(t.priceChange12hPercent || 0) },
      { k: '24h', v: Number(t.priceChange24hPercent || 0) }
    ];
    const box = (v, k) => {
      const up = v > 0, dn = v < 0;
      const bg = up ? 'rgba(14,180,102,0.25)' : (dn ? 'rgba(230,57,70,0.25)' : 'rgba(142,161,180,0.2)');
      return '<span title="' + k + ': ' + v.toFixed(2) + '%" style="width:16px;height:16px;border-radius:3px;background:' + bg + ';display:inline-block;border:1px solid rgba(255,255,255,0.12);"></span>';
    };
    return cells.map(c => box(c.v, c.k)).join('');
  })();
  const walletTrendSvg = (() => {
    try {
      const vals = [Number(t.uniqueWallet1h || 0), Number(t.uniqueWallet2h || 0), Number(t.uniqueWallet4h || 0), Number(t.uniqueWallet8h || 0), Number(t.uniqueWallet24h || 0)];
      const xs = vals.filter(v => isFinite(v));
      if (xs.length < 2) return '—';
      const w = 180, h = 28, p = 0;
      const min = Math.min(...xs), max = Math.max(...xs);
      const sx = (i) => (i / (xs.length - 1)) * (w - p * 2) + p;
      const sy = (v) => max === min ? h / 2 : h - ((v - min) / (max - min)) * (h - p * 2) - p;
      let d = '';
      xs.forEach((v, i) => { const x = sx(i), y = sy(v); d += (i ? ' L' : 'M') + x + ' ' + y; });
      return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="' + d + '" stroke="#4FB7F3" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    } catch { return '—'; }
  })();

  c.innerHTML = `
    <div class="stats-card">
      ${verifiedCornerHtml}
      <div class="stats-header">
        <div class="stats-title">
          <i class="fas fa-chart-line"></i>
          ${t.name || "Unknown"} ${verifiedNameAddon}
          <span class="contract-address" id="contractAddress" style="font-size: 11px;color: var(--text-muted);"></span>
        </div>
          <button class="copy-ca-btn" id="copyContract" aria-label="Copy contract address"><i class="fa-regular fa-copy" aria-hidden="true"></i></button>

      </div>
      <div class="chain-badge is-static" title="${chainInfo.name}">
        <span class="chain-icon" data-chain="${chainInfo.icon}"></span>
        ${chainInfo.name}
        <span id="nativePrice" class="native-price" style="display:none;"></span>
      </div>

      <div class="stats-grid">
        <div class="stat">
          <div id="priceSparkline" style="position:absolute;left:8px;right:8px;bottom:8px;height:24px;opacity:0.35;z-index:0;pointer-events:none;"></div>
          <div class="stat-value" style="position:relative;z-index:1;"><span id="mainFiatPrice">${formatTokenPrice(t.price)}</span></div>
          <div class="stat-label" style="position:relative;z-index:1;">Price</div>
        </div>

        <div class="stat ${chClass}">
          <div class="stat-value">${formatPct(ch)}</div>
          <div class="stat-label">24h Change</div>
        </div>

        <div class="stat">
          <div class="stat-value">${formatUSD(t.fdv)}</div>
          <div class="stat-label">FDV <i class="fa-solid fa-circle-info info-icon" data-info="Circulating Supply: ${(manualCircEnabled && isFinite(manualCirc) && manualCirc>0 ? manualCirc : (Number(t.circulatingSupply) || Number(t.totalSupply) || 0)).toLocaleString()}\nMarket Cap: ${formatUSD(marketCapDisplay)}"></i></div>
        </div>

        <div class="stat">
          <div class="stat-value">${formatUSD(t.liquidity)}</div>
          <div class="stat-label">Liquidity</div>
        </div>

        <div class="stat">
          <div class="stat-value">${(t.trade24h || 0).toLocaleString()}</div>
          <div class="stat-label">Trades (24h)</div>
        </div>

        <div class="stat">
          <div class="stat-value">${formatUSD(t.v24hUSD)}</div>
          <div class="stat-label">24h Volume</div>
        </div>

        <div class="stat">
          <div class="stat-value">${(t.holder || 0).toLocaleString()}</div>
          <div class="stat-label">Holders</div>
        </div>

        <div class="stat">
          <div class="stat-value">${(manualCircEnabled && isFinite(manualCirc) && manualCirc>0 ? manualCirc : Number(t.totalSupply || 0)).toLocaleString()}</div>
          <div class="stat-label">
            ${manualCircEnabled ? 'Circulating Supply' : 'Total Supply'}
            <a href="${chainInfo.url}" target="_blank" rel="noopener" aria-label="Open ${chainInfo.name} explorer" style="margin-left:6px;">
              <i class="fa-solid fa-arrow-up-right-from-square info-icon"></i>
            </a>
          </div>
        </div>
      </div>

      <button class="chart-toggle-btn" id="toggleChart">
        <i class="fa-solid fa-chart-area"></i> Chart
      </button>

      <div class="chart-panel" id="chartPanel">
        <div class="chart-wrap">
          <div class="chart-toolbar" id="chartToolbar">
            <button class="btn" data-int="1m">1m</button>
            <button class="btn" data-int="5m">5m</button>
            <button class="btn" data-int="15m">15m</button>
            <button class="btn" data-int="1h">1h</button>
            <button class="btn" data-int="4h">4h</button>
            <button class="btn" data-int="1d">1d</button>
          </div>
          <div id="candlesContainer"></div>
        </div>
      </div>

      <button class="metrics-toggle-btn" id="toggleMetrics">
        <i class="fa-solid fa-chart-simple"></i> Advanced Metrics
      </button>

      <div class="metrics-panel" id="metricsPanel">
        <div class="metrics-bars">
          <div class="metric-labels">
            <span>Buys (${t.buy24h || "—"})</span>
            <span>Sells (${t.sell24h || "—"})</span>
          </div>
          <div class="bar-container">
            <div class="bar bar-buy"></div>
            <div class="bar bar-sell"></div>
          </div>
          <div class="metric-subtext" style="display:flex;justify-content:space-between;margin-top:6px;color:var(--text-muted);font-size:0.75rem;">
            <span>${formatUSD(Number(t.vBuy24hUSD || 0))}</span>
            <span>${formatUSD(Number((t.vSell24hUSD != null) ? t.vSell24hUSD : (Math.max(0, Number(t.v24hUSD||0) - Number(t.vBuy24hUSD||0)))))}</span>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat">
            <div class="stat-value">${t.uniqueWallet24h || "—"}</div>
            <div class="stat-label">
              Active Wallets (24h)
              <i class="fa-solid fa-circle-info info-icon" data-info="Unique wallets that traded this token in the last 24 hours."></i>
            </div>
          </div>

          <div class="stat ${cls(t.uniqueWallet24hChangePercent || 0)}">
            <div class="stat-value">${formatPct(t.uniqueWallet24hChangePercent)}</div>
            <div class="stat-label">
              Wallet Momentum
              <i class="fa-solid fa-circle-info info-icon" data-info="Change in active wallets compared to the previous 24h period. Positive = growing interest."></i>
            </div>
          </div>

          <div class="stat">
            <div class="stat-value">${formatUSD(t.liquidity / (t.numberMarkets || 1))}</div>
            <div class="stat-label">
              Avg Liquidity/Market
              <i class="fa-solid fa-circle-info info-icon" data-info="Average liquidity across all exchanges or markets for this token."></i>
            </div>
          </div>

          <div class="stat">
            <div class="stat-value">${((t.holder / (t.uniqueWallet24h || 1)) || 0).toFixed(1)}x</div>
            <div class="stat-label">
              Holder:Trader Ratio
              <i class="fa-solid fa-circle-info info-icon" data-info="Compares long-term holders to active traders — higher = more holders vs traders."></i>
            </div>
          </div>

          <div class="stat ${cls((((t.buy24h + t.sell24h) * (t.uniqueWallet24hChangePercent || 0) / 100) / ((t.holder || 1) / 100) || 0))}">
            <div class="stat-value">${(((t.buy24h + t.sell24h) * (t.uniqueWallet24hChangePercent || 0) / 100) / ((t.holder || 1) / 100) || 0).toFixed(1)}</div>
            <div class="stat-label">
              Engagement Index
              <i class="fa-solid fa-circle-info info-icon" data-info="A composite score reflecting trading activity and wallet growth — higher = more active."></i>
            </div>
          </div>

          <div class="stat ${cls(priceMomentumScore)}">
            <div class="stat-value">${formatPct(priceMomentumScore)}</div>
            <div class="stat-label">
              Price Momentum Score
              <i class="fa-solid fa-circle-info info-icon" data-info="Weighted blend of 1h (50%), 4h (30%), and 24h (20%) percent changes. Helps smooth out noise while keeping recency."></i>
            </div>
          </div>

          <div class="stat">
            <div class="stat-value">${formatUSD(avgTradeSize)}</div>
            <div class="stat-label">
              Avg Trade Size (24h)
              <i class="fa-solid fa-circle-info info-icon" data-info="Average USD value per trade over the last 24 hours."></i>
            </div>
          </div>

<!-- New: Trader Activity Ratio -->
<div class="stat">
  <div class="stat-value" id="traderActivityValue">—</div>
  <div class="stat-label">
    Trader Activity (24h)
    <i class="fa-solid fa-circle-info info-icon" data-info="Average trades per active wallet in the last 24h - higher = more frequent trading or bot activity."></i>
  </div>
</div>

          <!-- New: Turnover Ratio -->
          <div class="stat">
            <div class="stat-value" id="turnoverValue">—</div>
            <div class="stat-label">
              Turnover Ratio (24h)
              <i class="fa-solid fa-circle-info info-icon" data-info="Trading intensity: 24h USD volume relative to market cap."></i>
            </div>
          </div>

          <!-- New: Buy/Sell Imbalance -->
          <div class="stat">
            <div class="stat-value" id="imbalanceValue">—</div>
            <div class="stat-label">
              Buy/Sell Imbalance (24h)
              <i class="fa-solid fa-circle-info info-icon" data-info="Net order flow: (buys - sells) / (buys + sells). Positive = buy-side dominance."></i>
            </div>
          </div>

          <!-- Momentum Heatmap (1h,2h,4h,6h,12h,24h) -->
          <div class="stat">
            <div class="stat-value" style="display:flex;gap:6px;align-items:center;">${momentumHeatmapHtml}</div>
            <div class="stat-label">Momentum Heatmap
              <i class="fa-solid fa-circle-info info-icon" data-info="Colored cells showing price change by timeframe (1h,2h,4h,6h,12h,24h)."></i>
            </div>
          </div>

          <!-- Volume Skew (Buy Vol / Total Vol 24h) -->
          <div class="stat">
            <div class="stat-value">${buyVolShareText}</div>
            <div class="stat-label">Buy Volume Share (24h)
              <i class="fa-solid fa-circle-info info-icon" data-info="Buy-side volume divided by total 24h volume."></i>
            </div>
          </div>

          <!-- Liquidity Coverage (MC / Liq) -->
          <div class="stat">
            <div class="stat-value">${mcLiqText}</div>
            <div class="stat-label">Valuation Coverage
              <i class="fa-solid fa-circle-info info-icon" data-info="Market Cap divided by Liquidity. Lower can imply deeper liquidity for current valuation."></i>
            </div>
          </div>

          <!-- Wallet Trend Strip (1h,2h,4h,8h,24h) -->
          <div class="stat">
            <div class="stat-value" style="width:100%;">${walletTrendSvg}</div>
            <div class="stat-label">Wallet Trend (1h→24h)
              <i class="fa-solid fa-circle-info info-icon" data-info="Trend of unique wallets over 1h to 24h."></i>
            </div>
          </div>
        </div>
      </div>

      <div class="refresh-container">
        <div class="last-updated">Updated: ${new Date().toLocaleTimeString()}</div>
        <div class="market-logos" id="marketLogos" style="flex:4; display:flex; justify-content:center; align-items:center; gap:14px;"></div>
        <button class="refresh-btn" id="refreshStats"><i class="fas fa-sync-alt"></i> Refresh</button>
      </div>
    </div>

  <a href="${tradeUrl}" class="trade-btn" target="_blank">
    <i class="fas fa-exchange-alt"></i> Trade ${t.symbol || ""}
  </a>
  <div class="action-buttons">
    <a id="extraBtn1" class="action-btn" target="_blank">Button 1</a>
    <a id="extraBtn2" class="action-btn" target="_blank">Button 2</a>
    <a id="extraBtn3" class="action-btn" href="#">Button 3</a>
  </div>
  <div id="brandingPanel"></div>
  <button class="contact-btn" id="contactBtn">
    <i class="fa-solid fa-envelope"></i> Contact Us
  </button>

  <div class="contact-section" id="contactSection">
    <div class="form-group">
      <label for="name">Your Name</label>
      <input type="text" id="name" placeholder="Name" aria-invalid="false">
      <span class="error-msg" id="err-name"></span>
    </div>
    <div class="form-group">
      <label for="topic">Topic</label>
      <select id="topic">
        <option value="General">General</option>
        <option value="Partnership">Partnership</option>
        <option value="Solar Investor Solutions">Solar Investor Solutions</option>
        <option value="Hardware Relocation">Hardware Relocation</option>
        <option value="Network Operations">Network Operations</option>
        <option value="Compute Buyer">Compute Buyer</option>
        <option value="Enterprise Compute">Enterprise Compute</option>
      </select>
      <span class="error-msg" id="err-topic"></span>
    </div>
    <div class="form-group">
      <label for="telegramId">Telegram ID</label>
      <input type="text" id="telegramId" placeholder="@username" aria-invalid="false">
      <span class="error-msg" id="err-telegram"></span>
    </div>
    <div class="form-group">
      <label for="email">Email Address</label>
      <input type="email" id="email" placeholder="your@email.com" aria-invalid="false">
      <span class="error-msg" id="err-email"></span>
    </div>
    <div class="form-group">
      <label for="message">Your Message</label>
      <textarea id="message" placeholder="Have a project, question, or partnership in mind? Let us know.." maxlength="500" aria-invalid="false"></textarea>
      <div class="field-meta"><span class="char-counter" id="messageCounter">0/500</span></div>
      <span class="error-msg" id="err-message"></span>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px; text-align: left;">
        💬 For quicker support or technical issues, join our
        <a href="https://t.co/FDpS2bxL5j" target="_blank" rel="noopener noreferrer" style="color: var(--primary); text-decoration: underline;">Discord.</a>
      </p>
    </div>
    <button class="submit-btn" id="submit">Submit</button>
  </div>
`;

  // Animate numeric stat values to count up for a delightful refresh UX
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const animateStatValue = (el, delay = 0, duration = 900) => {
    const raw = (el.textContent || '').trim();
    // Find first number in the text, preserve prefix/suffix (e.g., $, %, x)
    const match = raw.match(/(-?[0-9]*\.?[0-9]+)/);
    if (!match) return; // skip non-numeric tiles
    const numStr = match[1];
    const start = 0;
    const end = parseFloat(numStr);
    if (!isFinite(end)) return;
    const prefix = raw.slice(0, match.index);
    const suffix = raw.slice(match.index + numStr.length);
    const decimals = (numStr.split('.')[1] || '').length;
    const format = (n) => {
      const fixed = decimals > 0 ? n.toFixed(Math.min(decimals, 4)) : Math.round(n).toString();
      const parts = fixed.split('.');
      parts[0] = Number(parts[0]).toLocaleString();
      return parts.join('.');
    };
    const startAt = performance.now() + delay;
    const step = (ts) => {
      if (ts < startAt) { requestAnimationFrame(step); return; }
      const t = Math.min(1, (ts - startAt) / duration);
      const v = start + (end - start) * easeOutCubic(t);
      el.textContent = `${prefix}${format(v)}${suffix}`;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  try {
    // Stagger animations slightly for a cascading effect
    const statEls = c.querySelectorAll('.stat .stat-value');
    let idx = 0;
    statEls.forEach((el) => {
      // Avoid animating complex/inline SVG stat (wallet trend, heatmap)
      if (el.querySelector('svg') || el.children.length > 0 && !el.id) {
        return;
      }
      animateStatValue(el, idx * 50);
      idx++;
    });
  } catch {}

  // Dedicated price animation: animate from previous stored value to the latest
  try {
    const priceSpan = c.querySelector('#mainFiatPrice');
    if (priceSpan) {
      const key = `td_prev_price_${addr}`;
      const to = Number(t.price) || 0;
      // Use previously stored value if available; otherwise start from 0 so it animates on first render
      let from = Number(sessionStorage.getItem(key));
      if (!isFinite(from)) from = 0;
      if (!isFinite(to)) { sessionStorage.setItem(key, String(to || 0)); return; }
      const startAt = performance.now();
      const dur = 1000;
      const tick = (ts) => {
        const prog = Math.min(1, (ts - startAt) / dur);
        const v = from + (to - from) * easeOutCubic(prog);
        priceSpan.textContent = formatTokenPrice(v);
        if (prog < 1) requestAnimationFrame(tick); else sessionStorage.setItem(key, String(to));
      };
      requestAnimationFrame(tick);
    }
  } catch {}

// Config-driven: feature flags and theming
const cfEnabled = (() => {
  try {
    const f1 = cfg?.features?.enableContactForm;
    const f2 = cfg?.contactForm?.enabled;
    return (f1 !== false) && (f2 !== false);
  } catch { return true; }
})();

if (!cfEnabled) {
  try {
    const btn = document.getElementById('contactBtn');
    const sec = document.getElementById('contactSection');
    btn?.remove();
    sec?.remove();
  } catch {}
}

try {
  const theme = (cfg?.contactForm?.theme) || {};
  const btn = document.getElementById('contactBtn');
  const sec = document.getElementById('contactSection');
  const setVars = (el) => {
    if (!el) return;
    if (theme.primary) el.style.setProperty('--cf-primary', theme.primary);
    if (theme.primaryDark) el.style.setProperty('--cf-primary-dark', theme.primaryDark);
    if (theme.accent) el.style.setProperty('--cf-accent', theme.accent);
    if (theme.bg) el.style.setProperty('--cf-bg', theme.bg);
    if (theme.bgLight) el.style.setProperty('--cf-bg-light', theme.bgLight);
    if (theme.text) el.style.setProperty('--cf-text', theme.text);
    if (theme.textMuted) el.style.setProperty('--cf-text-muted', theme.textMuted);
    if (theme.border) el.style.setProperty('--cf-border', theme.border);
  };
  setVars(btn);
  setVars(sec);
} catch {}

// Handlers
const features = cfg?.features || {};
const barBuy = c.querySelector('.bar-buy');
const barSell = c.querySelector('.bar-sell');
const rvEl = c.querySelector('#rv24hValue');
const turnoverEl = c.querySelector('#turnoverValue');
const imbalanceEl = c.querySelector('#imbalanceValue');
const marketLogosEl = c.querySelector('#marketLogos');
// Contract address (from config) display + copy
try {
  const hardAddr = (cfg?.token?.address || '').trim();
  const addrEl = c.querySelector('#contractAddress');
  const copyBtn = c.querySelector('#copyContract');
  if (hardAddr && addrEl && copyBtn) {
    const trunc = hardAddr.length > 8 ? `${hardAddr.slice(0,4)}...${hardAddr.slice(-4)}` : hardAddr;
    addrEl.textContent = trunc;
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(hardAddr); copyBtn.classList.add('copied'); setTimeout(()=>copyBtn.classList.remove('copied'), 800); } catch {}
    });
  } else {
    if (addrEl) addrEl.style.display = 'none';
    const btn = c.querySelector('#copyContract');
    if (btn) btn.style.display = 'none';
  }
} catch {}
// Advanced Metrics toggle + bar animation
const panel = c.querySelector('#metricsPanel');
const toggleBtn = c.querySelector('#toggleMetrics');
// Respect feature flags: hide metrics if disabled
if (features.enableMetrics === false) {
  try {
    const metricsBtn = c.querySelector('#toggleMetrics');
    const metricsPanel = c.querySelector('#metricsPanel');
    metricsBtn?.remove();
    metricsPanel?.remove();
  } catch {}
}
if (toggleBtn && panel && barBuy && barSell) {
  let animatedOnce = false;
  toggleBtn.addEventListener('click', () => {
    const isOpen = panel.classList.toggle('open');
    toggleBtn.innerHTML = isOpen
      ? '<i class="fa-solid fa-xmark"></i> Hide Metrics'
      : '<i class="fa-solid fa-chart-simple"></i> Advanced Metrics';

    // Reset widths when closing
    if (!isOpen) {
      barBuy.style.width = '0%';
      if (barSell) barSell.style.width = '0%';
      animatedOnce = false;
      return;
    }

    // Start from 0 then animate to target after transition completes
    barBuy.style.width = '0%';
    if (barSell) barSell.style.width = '0%';

    const handleOpen = () => {
      if (!animatedOnce && panel.classList.contains('open')) {
        animatedOnce = true;
        requestAnimationFrame(() => {
          barBuy.style.width = buyPercent + '%';
          if (barSell) barSell.style.width = sellPercent + '%';
        });
      }
      panel.removeEventListener('transitionend', handleOpen);
    };
    panel.addEventListener('transitionend', handleOpen);
  });
}
  // Turnover Ratio display
  if (turnoverRatio != null && isFinite(turnoverRatio)) {
    turnoverEl.textContent = turnoverRatio.toFixed(2) + 'x';
  } else {
    turnoverEl.textContent = '—';
  }
// Trader Activity (24h)
const traderActivityEl = c.querySelector('#traderActivityValue');
if (t.trade24h && t.uniqueWallet24h) {
  const ratio = t.trade24h / t.uniqueWallet24h;
  traderActivityEl.textContent = ratio.toFixed(2) + '×';
} else {
  traderActivityEl.textContent = '—';
}

  // Load 24h Realized Volatility from 1h candles in background (prefer idle)
  const loadRV = async () => {
    try {
      const volData = await fetchTokenOHLCV(addr, chain, '1h', 36, true);
      const items = Array.isArray(volData?.items) ? volData.items : [];
      if (!items.length) throw new Error('no-ohlcv');
      const candles = items.map(k => ({
        time: Number(k.unix_time),
        open: Number(k.o),
        high: Number(k.h),
        low: Number(k.l),
        close: Number(k.c),
      }));
      const rv = computeRealizedVolFromCandles(candles);
      if (rvEl) rvEl.textContent = (rv != null && isFinite(rv)) ? (rv * 100).toFixed(2) + '%' : '—';
      try {
        const spark = document.getElementById('priceSparkline');
        if (spark) spark.innerHTML = drawSparkline(candles.slice(-24));
      } catch {}
    } catch {
      if (rvEl) rvEl.textContent = '—';
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(loadRV, { timeout: 1500 });
  else setTimeout(loadRV, 1);

  const drawSparkline = (arr) => {
    try {
      if (!Array.isArray(arr) || arr.length < 2) return '';
      const w = 180, h = 24, p = 0;
      const xs = arr.map(x => Number(x.close)).filter(v => isFinite(v));
      if (!xs.length) return '';
      const min = Math.min(...xs), max = Math.max(...xs);
      const scaleX = (i) => (i / (xs.length - 1)) * (w - p*2) + p;
      const scaleY = (v) => max === min ? h/2 : h - ((v - min) / (max - min)) * (h - p*2) - p;
      let d = '';
      xs.forEach((v,i) => { const x = scaleX(i), y = scaleY(v); d += (i? ' L':'M') + x + ' ' + y; });
      const up = xs[xs.length-1] >= xs[0];
      return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="${d}" stroke="${up ? '#0EB466' : '#E63946'}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    } catch { return ''; }
  };

  // Buy/Sell Imbalance display
  if (buySellImbalancePct != null && isFinite(buySellImbalancePct)) {
    const v = buySellImbalancePct;
    imbalanceEl.textContent = `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    const tile = imbalanceEl.closest('.stat');
    if (tile) { tile.classList.toggle('up', v > 0); tile.classList.toggle('down', v < 0); }
  } else {
    imbalanceEl.textContent = '—';
  }

  // Market logos (Dexscreener, Birdeye, Dextools) with config-driven labels and URLs only
  try {
    if (marketLogosEl) {
      const ml = (cfg?.marketLinks) || {};
      const ensure = (v, d='') => (typeof v === 'string' ? v : d);
      const items = [
        {
          key: 'dexscreener',
          label: ensure(ml?.dexscreener?.label, 'Dexscreener').trim(),
          href: ensure(ml?.dexscreener?.url, '') || '#',
          logo: ensure(ml?.dexscreener?.logoUrl, 'https://dexscreener.com/favicon.png'),
          aria: 'Open Dexscreener'
        },
        {
          key: 'birdeye',
          label: ensure(ml?.birdeye?.label, 'Birdeye').trim(),
          href: ensure(ml?.birdeye?.url, '') || '#',
          logo: ensure(ml?.birdeye?.logoUrl, 'https://birdeye.so/favicon.ico'),
          aria: 'Open Birdeye'
        },
        {
          key: 'dextools',
          label: ensure(ml?.dextools?.label, 'Dextools').trim(),
          href: ensure(ml?.dextools?.url, '') || '#',
          logo: ensure(ml?.dextools?.logoUrl, 'https://www.dextools.io/app/favicon.ico'),
          aria: 'Open Dextools'
        }
      ].filter(x => x.label.length > 0);

      marketLogosEl.innerHTML = items.map(x => `
        <a href="${x.href}" target="_blank" rel="noopener" class="market-logo-link" aria-label="${x.aria}" ${x.href === '#' ? 'data-nourl="1"' : ''}>
          <img src="${x.logo}" alt="${x.label}" class="market-logo" loading="lazy"/>
        </a>
      `).join('');

      // Prevent navigation if URL not provided in config
      marketLogosEl.querySelectorAll('a[data-nourl="1"]').forEach(a => {
        a.addEventListener('click', e => e.preventDefault());
      });
      const prefetch = (href) => {
        if (!href || href === '#') return;
        if (document.querySelector(`link[rel="prefetch"][href="${href}"]`)) return;
        const l = document.createElement('link'); l.rel = 'prefetch'; l.href = href; l.as = 'document'; document.head.appendChild(l);
      };
      marketLogosEl.querySelectorAll('a[href]').forEach(a => {
        a.addEventListener('mouseenter', () => prefetch(a.href), { passive: true });
        a.addEventListener('touchstart', () => prefetch(a.href), { passive: true });
        a.addEventListener('focus', () => prefetch(a.href), { passive: true });
      });
    }
  } catch {}

  const contactBtn = document.getElementById("contactBtn");
  const contactSection = document.getElementById("contactSection");
  if (contactBtn && contactSection) {
    // Ensure closed by default on render
    contactSection.classList.remove('open');
    contactSection.style.display = '';
    contactBtn.innerHTML = '<i class="fa-solid fa-envelope"></i> Contact Us';

    contactBtn.addEventListener("click", () => {
      const isOpen = contactSection.classList.toggle('open');
      contactBtn.innerHTML = isOpen
        ? '<i class="fa-solid fa-xmark"></i> Close Form'
        : '<i class="fa-solid fa-envelope"></i> Contact Us';
      if (isOpen) {
        contactSection.scrollIntoView({ behavior: "smooth", block: "start" });
        try {
          const msgEl = document.getElementById('message');
          const counter = document.getElementById('messageCounter');
          if (msgEl && counter) {
            counter.textContent = `${msgEl.value.length}/500`;
          }
          const nameEl = document.getElementById('name');
          nameEl?.focus();
        } catch {}
      }
    });
  }

  const telegramInput = document.getElementById("telegramId");
  if (telegramInput) {
    telegramInput.addEventListener("input", () => {
      if (!telegramInput.value.startsWith("@")) {
        telegramInput.value = "@" + telegramInput.value.replace(/^@+/, "");
      }
    });
  }

  if (!document.getElementById('notification')) {
    const n = document.createElement('div');
    n.id = 'notification';
    n.className = 'notification';
    n.innerHTML = '<p></p>';
    document.body.appendChild(n);
  }

  // Live validators and counter
  try {
    const nameEl = document.getElementById('name');
    const topicEl = document.getElementById('topic');
    const telEl = document.getElementById('telegramId');
    const emailEl = document.getElementById('email');
    const msgEl = document.getElementById('message');
    const counter = document.getElementById('messageCounter');

    const clearErr = (el, spanId) => {
      const span = document.getElementById(spanId);
      if (el) el.setAttribute('aria-invalid', 'false');
      if (span) span.textContent = '';
    };

    nameEl?.addEventListener('input', () => clearErr(nameEl, 'err-name'));
    topicEl?.addEventListener('change', () => clearErr(topicEl, 'err-topic'));
    telEl?.addEventListener('input', () => clearErr(telEl, 'err-telegram'));
    emailEl?.addEventListener('input', () => clearErr(emailEl, 'err-email'));
    msgEl?.addEventListener('input', () => {
      clearErr(msgEl, 'err-message');
      if (counter) counter.textContent = `${msgEl.value.length}/500`;
    });
  } catch {}

  const submitBtn = document.getElementById("submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const nameEl = document.getElementById("name");
      const topicEl = document.getElementById("topic");
      const telEl = document.getElementById("telegramId");
      const emailEl = document.getElementById("email");
      const msgEl = document.getElementById("message");
      const name = nameEl?.value.trim();
      const topic = topicEl?.value.trim();
      const telegramId = telEl?.value.trim();
      const email = emailEl?.value.trim();
      const message = msgEl?.value.trim();
      const notification = document.getElementById('notification');

      const setErr = (el, spanId, msg) => {
        const span = document.getElementById(spanId);
        if (el) el.setAttribute('aria-invalid', 'true');
        if (span) span.textContent = msg || '';
      };
      const clearErr = (el, spanId) => {
        const span = document.getElementById(spanId);
        if (el) el.setAttribute('aria-invalid', 'false');
        if (span) span.textContent = '';
      };

      let hasError = false;
      clearErr(nameEl, 'err-name');
      clearErr(topicEl, 'err-topic');
      clearErr(telEl, 'err-telegram');
      clearErr(emailEl, 'err-email');
      clearErr(msgEl, 'err-message');

      if (!name) { setErr(nameEl, 'err-name', 'Please enter your name'); hasError = true; }
      if (!topic) { setErr(topicEl, 'err-topic', 'Please select a topic'); hasError = true; }
      if (!telegramId || !telegramId.startsWith('@') || telegramId.length < 4) {
        setErr(telEl, 'err-telegram', 'Enter a valid Telegram (e.g., @HabitatUser)');
        hasError = true;
      }
      const emailOk = !!email && /.+@.+\..+/.test(email);
      if (!emailOk) { setErr(emailEl, 'err-email', 'Enter a valid email'); hasError = true; }
      if (!message) { setErr(msgEl, 'err-message', 'Please write a message'); hasError = true; }
      if (msgEl && msgEl.value.length > 500) { setErr(msgEl, 'err-message', 'Message is too long'); hasError = true; }
      if (hasError) return;

      const data = { name, topic, telegramId, email, message };

      try {
        await fetch("https://flowxo.com/hooks/a/x2gm2j5y", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data)
        });
        notification.querySelector('p').innerHTML = "✅ Your form has been submitted!<br><br>Somebody from the Habitat team will be in touch shortly.";
        notification.classList.add('show');

        if (nameEl) nameEl.value = "";
        if (topicEl) topicEl.value = "General";
        if (telEl) telEl.value = "";
        if (emailEl) emailEl.value = "";
        if (msgEl) msgEl.value = "";
        const counter = document.getElementById('messageCounter');
        if (counter) counter.textContent = '0/500';

        setTimeout(() => {
          notification.classList.remove('show');
          if (contactSection && contactBtn) {
            contactSection.classList.remove('open');
            contactBtn.innerHTML = '<i class="fa-solid fa-envelope"></i> Contact Us';
            window.scrollTo({ top: 0, behavior: "smooth" });
          }
        }, 1500);
      } catch (error) {
        console.error(error);
        notification.querySelector('p').innerHTML = "⚠️ Error sending message. Please try again later.";
        notification.classList.add('show');
        setTimeout(() => notification.classList.remove('show'), 2500);
      }
    });
  }

  // Native chain token price in chain-badge (async IIFE)
  (async () => {
    try {
      const nativeMap = (getCfg()?.nativeTokens) || {};
      const natAddr = nativeMap[chain] || nativeMap['ethereum'];
      const priceEl = document.getElementById('nativePrice');
      if (natAddr && priceEl) {
        const nat = await fetchTokenData(natAddr, chain);
        if (nat && typeof nat.price === 'number' && isFinite(nat.price)) {
          priceEl.textContent = formatTokenPrice(nat.price);
          priceEl.style.display = 'inline-flex';
        } else {
          priceEl.style.display = 'none';
        }
      }
    } catch {}
  })();

  // Extra configurable action buttons
  try {
    const buttonsCfg = (cfg?.buttons) || {};
    const b1 = buttonsCfg.button1 || { label: 'Button 1', url: '' };
    const b2 = buttonsCfg.button2 || { label: 'Button 2', url: '' };
    const b3 = buttonsCfg.button3 || { label: 'Button 3', title: 'Branding', contentHtml: '' };

    const extra1 = document.getElementById('extraBtn1');
    const extra2 = document.getElementById('extraBtn2');
    const extra3 = document.getElementById('extraBtn3');
    const brandingPanel = document.getElementById('brandingPanel');

    const setBtn = (el, cfgBtn) => {
      const label = (cfgBtn?.label ?? '').trim();
      if (!label) { el.style.display = 'none'; return; }
      el.textContent = label;
    };

    if (extra1) {
      setBtn(extra1, b1);
      const url = (b1.url || '').trim();
      if (url) extra1.href = url; else { extra1.href = '#'; extra1.addEventListener('click', e => e.preventDefault(), { once: true }); }
    }
    if (extra2) {
      setBtn(extra2, b2);
      const url = (b2.url || '').trim();
      if (url) extra2.href = url; else { extra2.href = '#'; extra2.addEventListener('click', e => e.preventDefault(), { once: true }); }
    }
    if (extra3 && brandingPanel) {
      setBtn(extra3, b3);
      const title = (b3.title || 'Branding').trim();
      const content = (b3.contentHtml || '').trim();
      // Pre-hydrate panel content
      brandingPanel.innerHTML = `
        <div class="stats-card">
          <div class="stats-header">
            <div class="stats-title"><i class="fas fa-star"></i> ${title}</div>
          </div>
          <div class="stats-grid">
            ${content || '<div style="color:var(--text-muted);">No branding content configured.</div>'}
          </div>
        </div>
      `;

  // Ensure chain icon is visible across browsers
  ensureChainIconVisible(c);
      brandingPanel.classList.remove('open');
      brandingPanel.style.display = 'none';
      extra3.addEventListener('click', (e) => {
        e.preventDefault();
        const isOpen = brandingPanel.classList.toggle('open');
        brandingPanel.style.display = isOpen ? 'block' : 'none';
      });
    }
  } catch {}

  // Chart toggle + init
  const chartPanel = document.getElementById('chartPanel');
  const chartToggleBtn = document.getElementById('toggleChart');
  const chartContainer = document.getElementById('candlesContainer');
  const chartToolbar = document.getElementById('chartToolbar');
  // Ensure closed on render to avoid stale state from previous renders
  try { chartPanel?.classList.remove('open'); } catch {}
  // Ensure only single wiring is active; fallback handled within legacy block
  // Respect feature flags: hide chart if disabled
  if (features.enableChart === false) {
    try {
      chartToggleBtn?.remove();
      chartPanel?.remove();
    } catch {}
  }
  // If modular chart is enabled, use it only if the module is available; otherwise fallback to legacy wiring
  let modularChart = features.modularChart === true;
  if (modularChart) {
    const hasModule = typeof window !== 'undefined' && window.TokenDockChart && typeof window.TokenDockChart.init === 'function';
    if (!hasModule) modularChart = false;
  }
  if (modularChart) {
    let modularInited = false;
    if (chartToggleBtn && chartToggleBtn.dataset.wired !== '1') {
      chartToggleBtn.dataset.wired = '1';
      chartToggleBtn.addEventListener('click', () => {
        const isOpen = chartPanel.classList.toggle('open');
        chartToggleBtn.innerHTML = isOpen
          ? '<i class="fa-solid fa-xmark"></i> Hide Chart'
          : '<i class="fa-solid fa-chart-area"></i> Chart';
        if (isOpen && !modularInited) {
          try { window.TokenDockChart.init(chartContainer, { address: addr, chain }); modularInited = true; } catch {}
        }
      });
    }
  } else {
    // Persisted user prefs
    const prefKey = (k) => `td_pref_${k}_${addr}_${chain}`;
    const savedInterval = sessionStorage.getItem(prefKey('interval'));
    const savedHA = sessionStorage.getItem(prefKey('ha'));
    let chartObj = null;
    let activeInterval = savedInterval || '1h';
    let useHeikinAshi = savedHA == null ? true : savedHA === 'true';

    // Inject HA toggle button
    if (chartToolbar && !chartToolbar.querySelector('[data-ha]')) {
      const haBtn = document.createElement('button');
      haBtn.className = 'btn';
      haBtn.setAttribute('data-ha', 'toggle');
      haBtn.textContent = 'HA';
      chartToolbar.appendChild(haBtn);

      haBtn.addEventListener('click', async () => {
        useHeikinAshi = !useHeikinAshi;
        sessionStorage.setItem(prefKey('ha'), String(useHeikinAshi));
        haBtn.classList.toggle('active', useHeikinAshi);
        await ensureChart(activeInterval);
      });
      if (useHeikinAshi) haBtn.classList.add('active');
    }

    function intervalSeconds(intv) {
      return ({ '1s':1,'15s':15,'30s':30,'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400 })[intv] || 3600;
    }

    function setActiveIntervalBtn(intv) {
      chartToolbar?.querySelectorAll('.btn[data-int]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.int === intv);
      });
    }

    // Prevent race conditions on fast switching
    let chartRequestSeq = 0;

    async function ensureChart(intv = activeInterval) {
      const reqId = ++chartRequestSeq;

      if (!chartObj) {
        // Clear any previous canvas remnants before first init (defensive)
        try { chartContainer.innerHTML = ''; } catch {}
        chartObj = initChart(chartContainer);
        if (typeof ResizeObserver === 'function') {
          const ro = new ResizeObserver(() => {
            chartObj.chart.applyOptions({
              width: chartContainer.clientWidth,
              height: chartContainer.clientHeight
            });
          });
          ro.observe(chartContainer);
        }
        chartObj.chart.applyOptions({
          width: chartContainer.clientWidth,
          height: chartContainer.clientHeight
        });
      }

      chartContainer.setAttribute('aria-busy', 'true');
      try {
        const data = await fetchTokenOHLCV(addr, chain, intv, 48, true);
        if (reqId !== chartRequestSeq) return; // newer request superseded this one

        const items = Array.isArray(data.items) ? data.items : [];
        if (!items.length) throw new Error('No OHLCV items returned');

        renderOHLCV(
          chartObj.candleSeries,
          chartObj.volumeSeries,
          items,
          chartObj.ema20Series,
          chartObj.ema50Series,
          useHeikinAshi,
          chartObj.chart,
          intervalSeconds(intv)
        );

        const oldErr = chartContainer.querySelector?.('.chart-error');
        if (oldErr && oldErr.remove) oldErr.remove();
      } catch (err) {
        if (reqId !== chartRequestSeq) return;
        console.error('Chart error:', err);
        let msg = chartContainer.querySelector('.chart-error');
        if (!msg) {
          msg = document.createElement('div');
          msg.className = 'chart-error';
          msg.style.cssText = 'position:absolute;inset:auto 10px 10px 10px;color:#E63946;font-size:12px;background:rgba(0,0,0,0.3);padding:6px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.1)';
          chartContainer.style.position = 'relative';
          chartContainer.appendChild(msg);
        }
        msg.innerHTML = `No candles for this interval/range. Try another interval.
          <div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">
            <button data-retry-intv="1h" style="background:rgba(42,171,238,0.15);border:1px solid rgba(42,171,238,0.3);color:#E9EEF4;padding:4px 8px;border-radius:6px;cursor:pointer;">1h</button>
            <button data-retry-intv="4h" style="background:rgba(42,171,238,0.15);border:1px solid rgba(42,171,238,0.3);color:#E9EEF4;padding:4px 8px;border-radius:6px;cursor:pointer;">4h</button>
            <button data-retry-intv="1d" style="background:rgba(42,171,238,0.15);border:1px solid rgba(42,171,238,0.3);color:#E9EEF4;padding:4px 8px;border-radius:6px;cursor:pointer;">1d</button>
          </div>`;
        msg.querySelectorAll('button[data-retry-intv]')?.forEach(btn => {
          btn.addEventListener('click', async () => {
            const intv = btn.getAttribute('data-retry-intv');
            if (!intv) return;
            activeInterval = intv;
            setActiveIntervalBtn(activeInterval);
            await ensureChart(activeInterval);
          }, { once: true });
        });
      } finally {
        chartContainer.removeAttribute('aria-busy');
      }
    }

    // Expose for optional external calls (used by basic fallback)
    try { window.__tdEnsureChart = ensureChart; } catch {}

    if (chartToggleBtn && chartToggleBtn.dataset.wired !== '1') {
      chartToggleBtn.dataset.wired = '1';
      chartToggleBtn.addEventListener('click', async () => {
        const isOpen = chartPanel.classList.toggle('open');
        chartToggleBtn.innerHTML = isOpen
          ? '<i class="fa-solid fa-xmark"></i> Hide Chart'
          : '<i class="fa-solid fa-chart-area"></i> Chart';
        if (isOpen) {
          // Apply configurable mobile chart height if provided
          try {
            const minH = (getCfg()?.features?.minChartHeightMobile);
            if (typeof minH === 'number' && window.innerWidth < 500) {
              chartContainer.style.height = `${minH}px`;
            }
          } catch {}
          setActiveIntervalBtn(activeInterval);
          await ensureChart(activeInterval);
        }
      });
    }

    chartToolbar?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.btn[data-int]');
      if (!btn) return;
      const intv = btn.dataset.int;
      if (!intv || intv === activeInterval) return;
      activeInterval = intv;
      sessionStorage.setItem(prefKey('interval'), activeInterval);
      setActiveIntervalBtn(intv);
      await ensureChart(activeInterval);
    });

    // If user opens chart immediately, highlight persisted/default
    setActiveIntervalBtn(activeInterval);
  }


  const copyBtn = c.querySelector(".copy-ca-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(addr);
    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => (copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'), 1500);
  });

  // Ensure Share control appears inside the market logos row and matches their size
  try {
    const logos = document.getElementById('marketLogos');
    let shareBtn = document.getElementById('shareDock');
    if (logos && !shareBtn) {
      // Create as a logo-style pill
      const a = document.createElement('a');
      a.id = 'shareDock';
      a.href = '#';
      a.className = 'market-logo-link';
      a.setAttribute('aria-label', 'Share this dock');
      a.innerHTML = '<i class="fa-solid fa-share-nodes" style="font-size:18px; color: var(--primary);"></i>';
      logos.appendChild(a);
      shareBtn = a;
    }
  } catch {}

  document.getElementById('shareDock')?.addEventListener('click', async (e) => {
    e?.preventDefault?.();
    const url = location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: t.name || 'Token Dock', url });
        return;
      }
    } catch {}
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById('shareDock');
      btn.innerHTML = '<i class="fa-solid fa-check"></i> Copied';
      setTimeout(() => btn.innerHTML = '<i class="fa-solid fa-share-nodes"></i> Share', 1500);
    } catch {}
  });

  document.getElementById("refreshStats").addEventListener("click", () => {
    try {
      sessionStorage.removeItem(`td_overview_${addr}`);
      // also clear short OHLCV cache for this addr/chain to force fresh next time
      ['1m','5m','15m','30m','1h','4h','1d'].forEach(i => {
        try { sessionStorage.removeItem(ohlcvCacheKey(addr, chain, i)); } catch {}
      });
    } catch {}
    hydrateFresh();
  });

  // Removed delegated/global fallbacks to avoid double wiring
}

/* Info popups (delegated) */
function onInfoIconClick(e) {
  e.stopPropagation();
  const targetIcon = e.target.classList?.contains('info-icon') ? e.target : e.target.closest?.('.info-icon');
  if (!targetIcon) return;

  document.querySelectorAll('.info-popup').forEach(p => p.remove());

  const text = targetIcon.dataset.info;
  if (!text) return;

  const popup = document.createElement('div');
  popup.className = 'info-popup floating';
  popup.textContent = text;
  document.body.appendChild(popup);

  const iconRect = targetIcon.getBoundingClientRect();
  const scrollY = window.scrollY || document.documentElement.scrollTop;
  const scrollX = window.scrollX || document.documentElement.scrollLeft;

  const gap = 10;
  const { width: pw, height: ph } = popup.getBoundingClientRect();
  let left = scrollX + iconRect.left + (iconRect.width / 2) - (pw / 2);
  let top = scrollY + iconRect.top - ph - gap;

  if (top < scrollY + 8) {
    top = scrollY + iconRect.bottom + gap;
  }

  const vw = document.documentElement.clientWidth;
  const minLeft = scrollX + 8;
  const maxLeft = scrollX + vw - pw - 8;
  left = Math.max(minLeft, Math.min(left, maxLeft));

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
  // Slight delay before showing to avoid accidental flicker
  const showTimer = setTimeout(() => popup.classList.add('visible'), 150);

  const closePopup = function(event) {
    if (!popup.contains(event.target) && !targetIcon.contains(event.target)) {
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 200);
      document.removeEventListener('click', closePopup, true);
      document.removeEventListener('keydown', onEsc, true);
      clearTimeout(showTimer);
    }
  };
  const onEsc = (e) => {
    if (e.key === 'Escape') {
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 200);
      document.removeEventListener('click', closePopup, true);
      document.removeEventListener('keydown', onEsc, true);
      clearTimeout(showTimer);
    }
  };
  document.addEventListener('click', closePopup, { capture: true, passive: true });
  document.addEventListener('keydown', onEsc, true);
}
document.addEventListener('click', onInfoIconClick, { passive: true });

/* Main hydration with cache + parallel probing */
async function hydrateFresh() {
  const addr = getAddress();
  const urlChain = getChainFromURL();
  const container = document.getElementById("statsContainer");
  container.innerHTML = skeletonHTML();

  // ✅ Step 1: detect or infer chain
  let detectedChain = urlChain || "solana";
  if (!urlChain) {
    if (addr.startsWith("0x")) detectedChain = "ethereum";
    else if (addr.length === 44) detectedChain = "solana";
  }

  // ✅ Step 2: prioritize that chain, but fall back to others if needed
  const likely = [detectedChain];
  const rest = SUPPORTED_CHAINS.filter(c => !likely.includes(c));
  const chainOrder = [...likely, ...rest];

  // ✅ Step 3: try chains sequentially to avoid spamming errors; stop on 400 (proxy misconfig)
  const firstGood = async (chains) => {
    for (const c of chains) {
      try {
        const d = await fetchTokenData(addr, c);
        if (d && d.symbol) return { chain: c, data: d };
      } catch (err) {
        const msg = String(err || '');
        if (msg.includes(': 400')) {
          // Proxy likely misconfigured/unavailable; abort further attempts
          return null;
        }
      }
    }
    return null;
  };

  let found = await firstGood(chainOrder);

  if (!found) {
    container.innerHTML = "<p style='color:var(--text-muted)'>No overview found on supported chains.</p>";
    return;
  }

  cacheSet(`td_overview_${addr}`, found);
  renderDock(found.data, found.chain);
}

/* Boot: use cache first, refresh in background */
(function boot() {
  const addr = getAddress();
  const cacheKey = `td_overview_${addr}`;
  const cached = cacheGet(cacheKey);
  if (cached?.data && cached?.chain) {
    try {
      const container = document.getElementById('statsContainer');
      if (getCfg()?.features?.skeletonOnCacheHit) {
        container.innerHTML = skeletonHTML();
      }
    } catch {}
    // Render immediately (or after skeleton frame if enabled)
    setTimeout(() => renderDock(cached.data, cached.chain), 0);
    if ('requestIdleCallback' in window) requestIdleCallback(() => hydrateFresh(), { timeout: 1500 });
    else setTimeout(hydrateFresh, 1);
  } else {
    hydrateFresh();
  }
})();
