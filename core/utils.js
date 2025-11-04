export function fetchWithTimeout(url, options = {}, ms = 6000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export function cacheSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch {} }
export function cacheGet(k, maxAgeMs = 120000) {
  try {
    const raw = sessionStorage.getItem(k); if (!raw) return null;
    const obj = JSON.parse(raw); if (!obj || Date.now() - obj.t > maxAgeMs) return null;
    return obj.v;
  } catch { return null; }
}

export function promiseAny(promises) {
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

export function formatUSD(n) {
  if (!n || isNaN(n)) return "$0";
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  return "$" + Number(n).toFixed(2);
}

export function formatPct(x) {
  return `${x > 0 ? '+' : ''}${Number(x || 0).toFixed(2)}%`;
}

export function normalizeInterval(intv) {
  const map = {
    '1m': '1m','5m':'5m','15m':'15m','30m':'30m',
    '1h':'1H','4h':'4H','1d':'1D',
    '1s':'1s','15s':'15s','30s':'30s',
  };
  return map[intv] || intv;
}

export function intervalSeconds(intv) {
  return ({ '1s':1,'15s':15,'30s':30,'1m':60,'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400 })[intv] || 3600;
}

export function ohlcvCacheKey(addr, chain, interval) {
  return `td_ohlcv_${chain}_${addr}_${interval}`;
}
export function getCachedOHLCV(addr, chain, interval, ttlMs = 60000) {
  return cacheGet(ohlcvCacheKey(addr, chain, interval), ttlMs);
}
export function setCachedOHLCV(addr, chain, interval, data) {
  cacheSet(ohlcvCacheKey(addr, chain, interval), data);
}
