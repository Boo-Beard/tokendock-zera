const API_BASE = "/api/birdeye";
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
  if (v >= 1000) return '$' + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (v >= 1) return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  if (v >= 0.1) return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 });
  if (v >= 0.01) return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 8, maximumFractionDigits: 8 });
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

const base = typeof window !== 'undefined' ? window.location.origin : 'https://www.tokendock.io';
const url = new URL(base + `${API_BASE}`);
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

  const turnoverRatio = (t.marketCap > 0 && t.v24hUSD >= 0)
    ? (t.v24hUSD / t.marketCap)
    : null;

  const buySellImbalancePct = (buys + sells) > 0
    ? ((buys - sells) / (buys + sells)) * 100
    : null;

  const avgTradeSize =
    (t.v24hUSD || 0) / Math.max(1, t.trade24h || 0);

  c.innerHTML = `
    <div class="stats-card">
      <div class="stats-header">
        <div class="stats-title">
          <i class="fas fa-chart-line"></i>
          ${t.name || "Unknown"}
          <span class="contract-address" id="contractAddress" style="font-size: 11px;"></span>
        </div>
          <button class="copy-ca-btn" id="copyContract"><i class="fa-regular fa-copy"></i></button>

      </div>
      <div class="chain-badge is-static" title="${chainInfo.name}">
        <span class="chain-icon" data-chain="${chainInfo.icon}"></span>
        ${chainInfo.name}
        <span id="nativePrice" class="native-price" style="display:none;"></span>
      </div>

      <div class="stats-grid">
        <div class="stat">
          <div class="stat-value">${formatTokenPrice(t.price)}</div>
          <div class="stat-label">Price</div>
        </div>

        <div class="stat ${chClass}">
          <div class="stat-value">${formatPct(ch)}</div>
          <div class="stat-label">24h Change</div>
        </div>

        <div class="stat">
          <div class="stat-value">${formatUSD(t.marketCap)}</div>
          <div class="stat-label">Market Cap</div>
        </div>

        <div class="stat">
          <div class="stat-value">${formatUSD(t.fdv)}</div>
          <div class="stat-label">FDV</div>
        </div>

        <div class="stat">
          <div class="stat-value">${formatUSD(t.liquidity)}</div>
          <div class="stat-label">Liquidity</div>
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
          <div class="stat-value">${Number(t.totalSupply || 0).toLocaleString()}</div>
          <div class="stat-label">
            Total Supply
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
`;

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
      barSell.style.width = '0%';
      animatedOnce = false;
      return;
    }

    // Start from 0 then animate to target after transition completes
    barBuy.style.width = '0%';
    barSell.style.width = '0%';

    const handleOpen = () => {
      if (!animatedOnce && panel.classList.contains('open')) {
        animatedOnce = true;
        requestAnimationFrame(() => {
          barBuy.style.width = buyPercent + '%';
          barSell.style.width = sellPercent + '%';
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
    } catch {
      if (rvEl) rvEl.textContent = '—';
    }
  };
  if ('requestIdleCallback' in window) requestIdleCallback(loadRV, { timeout: 1500 });
  else setTimeout(loadRV, 1);

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
    }
  } catch {}

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
  if (!modularChart) {
    // Persisted user prefs
    const prefKey = (k) => `td_pref_${k}_${addr}_${chain}`;
    const savedInterval = sessionStorage.getItem(prefKey('interval'));
    const savedHA = sessionStorage.getItem(prefKey('ha'));
    let chartObj = null;
    let activeInterval = savedInterval || (getCfg()?.features?.defaultChartInterval || '4h');
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
        msg.textContent = 'No candles for this interval/range. Try another interval.';
      } finally {
        chartContainer.removeAttribute('aria-busy');
      }
    }

    // Expose for optional external calls
    try { window.__tdEnsureChart = ensureChart; } catch {}

    chartToggleBtn?.addEventListener('click', async () => {
      const isOpen = chartPanel.classList.toggle('open');
      chartToggleBtn.innerHTML = isOpen
        ? '<i class="fa-solid fa-xmark"></i> Hide Chart'
        : '<i class="fa-solid fa-chart-area"></i> Chart';
      if (isOpen) {
        setActiveIntervalBtn(activeInterval);
        await ensureChart(activeInterval);
      }
    });

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

  // Persisted user prefs
  const prefKey = (k) => `td_pref_${k}_${addr}_${chain}`;
  const savedInterval = sessionStorage.getItem(prefKey('interval'));
  const savedHA = sessionStorage.getItem(prefKey('ha'));
  let chartObj = null;
  let activeInterval = savedInterval || (getCfg()?.features?.defaultChartInterval || '4h');
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
      msg.textContent = 'No candles for this interval/range. Try another interval.';
    } finally {
      chartContainer.removeAttribute('aria-busy');
    }
  }

  chartToggleBtn?.addEventListener('click', async () => {
    const isOpen = chartPanel.classList.toggle('open');
    chartToggleBtn.innerHTML = isOpen
      ? '<i class="fa-solid fa-xmark"></i> Hide Chart'
      : '<i class="fa-solid fa-chart-area"></i> Chart';
    if (isOpen) {
      setActiveIntervalBtn(activeInterval);
      await ensureChart(activeInterval);
    }
  });

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

  const copyBtn = c.querySelector(".copy-ca-btn");
  copyBtn.addEventListener("click", () => {
    navigator.clipboard.writeText(addr);
    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
    setTimeout(() => (copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>'), 1500);
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
  setTimeout(() => popup.classList.add('visible'), 10);

  const closePopup = function(event) {
    if (!popup.contains(event.target) && !targetIcon.contains(event.target)) {
      popup.classList.remove('visible');
      setTimeout(() => popup.remove(), 200);
      document.removeEventListener('click', closePopup, true);
    }
  };
  document.addEventListener('click', closePopup, true);
}
document.addEventListener('click', onInfoIconClick);

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

  // ✅ Step 3: same logic as before
  const firstGood = async (chains) => {
    const tasks = chains.map(c => (async () => {
      const d = await fetchTokenData(addr, c);
      if (d && d.symbol) return { chain: c, data: d };
      throw new Error("no-data");
    })());
    try { return await promiseAny(tasks); } catch { return null; }
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
    renderDock(cached.data, cached.chain);
    if ('requestIdleCallback' in window) requestIdleCallback(() => hydrateFresh(), { timeout: 1500 });
    else setTimeout(hydrateFresh, 1);
  } else {
    hydrateFresh();
  }
})();
