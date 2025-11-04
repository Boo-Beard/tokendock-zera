import { fetchTokenOHLCV } from '../../core/api.js';
import { intervalSeconds } from '../../core/utils.js';

function getCfg() {
  try { return window.TOKEN_DOCK_CONFIG || {}; } catch { return {}; }
}

function chartOptionsTheme(theme = {}) {
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
    timeScale: { borderColor: 'transparent', rightOffset: 8, barSpacing: 6 },
    rightPriceScale: { borderColor: 'transparent', scaleMargins: { top: 0.2, bottom: 0.25 } },
    localization: { priceFormatter: p => '$' + Number(p).toFixed(6) },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, vertTouchDrag: true },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  };
}

function toHeikinAshi(candles) {
  if (!candles.length) return [];
  const ha = [];
  let prevHA = { open: candles[0].open, close: (candles[0].open + candles[0].high + candles[0].low + candles[0].close) / 4 };
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

function createChart(container, themeCfg) {
  const chart = LightweightCharts.createChart(container, chartOptionsTheme(themeCfg));
  const candleSeries = chart.addCandlestickSeries({
    upColor: themeCfg.upColor || 'rgba(14,180,102,0.35)',
    downColor: themeCfg.downColor || 'rgba(230,57,70,0.35)',
    borderUpColor: themeCfg.borderUpColor || '#17D77E',
    borderDownColor: themeCfg.borderDownColor || '#FF4B5C',
    wickUpColor: themeCfg.wickUpColor || 'rgba(23,215,126,0.9)',
    wickDownColor: themeCfg.wickDownColor || 'rgba(255,75,92,0.9)',
  });
  const volumeSeries = chart.addHistogramSeries({ priceScaleId: '', priceFormat: { type: 'volume' }, base: 0, color: themeCfg.volumeColor || 'rgba(142,161,180,0.35)', scaleMargins: { top: 0.8, bottom: 0 } });
  chart.priceScale('').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
  const ema20Series = chart.addLineSeries({ color: themeCfg.ema20Color || '#4FB7F3', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
  const ema50Series = chart.addLineSeries({ color: themeCfg.ema50Color || '#B084F7', lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
  return { chart, candleSeries, volumeSeries, ema20Series, ema50Series };
}

function renderOHLCV(chartObj, items, useHA, intv) {
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
  chartObj.candleSeries.setData(candles);
  chartObj.volumeSeries.setData(volumes);
  chartObj.ema20Series.setData(computeEMA(baseCandles, 20));
  chartObj.ema50Series.setData(computeEMA(baseCandles, 50));

  if (candles.length) {
    const SHOW = Math.min(150, candles.length);
    const last = candles[candles.length - 1].time;
    const span = SHOW * intervalSeconds(intv);
    const from = last - span;
    try { chartObj.chart.timeScale().setVisibleRange({ from, to: last }); }
    catch { chartObj.chart.timeScale().fitContent(); }
  }
}

function resolveAddressChain() {
  const cfg = getCfg();
  const addr = cfg?.token?.address || (() => {
    const p = new URLSearchParams(location.search);
    return p.get('address')?.trim() || '';
  })();
  let chain = (cfg?.token?.chain || '').toLowerCase();
  if (!chain) {
    const p = new URLSearchParams(location.search);
    chain = p.get('chain')?.toLowerCase() || '';
  }
  if (!chain) {
    if (addr?.startsWith('0x')) chain = 'ethereum';
    else if (addr?.length === 44) chain = 'solana';
    else chain = cfg?.resolution?.defaultChain || 'solana';
  }
  return { addr, chain };
}

export async function mount() {
  const cfg = getCfg();
  if (cfg?.features?.enableChart === false) return;
  const toggleBtn = document.getElementById('toggleChart');
  const chartPanel = document.getElementById('chartPanel');
  const chartToolbar = document.getElementById('chartToolbar');
  const chartContainer = document.getElementById('candlesContainer');
  if (!toggleBtn || !chartPanel || !chartContainer) return;

  const themeCfg = cfg.chartTheme || {};
  const { addr, chain } = resolveAddressChain();

  const prefKey = (k) => `td_pref_${k}_${addr}_${chain}`;
  let activeInterval = sessionStorage.getItem(prefKey('interval')) || (cfg.features?.defaultChartInterval || '1h');
  let useHeikinAshi = (sessionStorage.getItem(prefKey('ha')) ?? String(cfg.features?.defaultHeikinAshi ?? true)) === 'true';

  let chartObj = null;
  let chartRequestSeq = 0;

  function setActiveIntervalBtn(intv) {
    chartToolbar?.querySelectorAll('.btn[data-int]')?.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.int === intv);
    });
  }

  async function ensureChart(intv = activeInterval) {
    const reqId = ++chartRequestSeq;
    if (!chartObj) {
      chartObj = createChart(chartContainer, themeCfg);
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(() => {
          chartObj.chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
        });
        ro.observe(chartContainer);
      }
      chartObj.chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight });
    }

    chartContainer.setAttribute('aria-busy', 'true');
    try {
      const data = await fetchTokenOHLCV(addr, chain, intv, 48, true);
      if (reqId !== chartRequestSeq) return;
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) throw new Error('No OHLCV items returned');
      renderOHLCV(chartObj, items, useHeikinAshi, intv);
      const oldErr = chartContainer.querySelector?.('.chart-error');
      if (oldErr && oldErr.remove) oldErr.remove();
    } catch (err) {
      if (reqId !== chartRequestSeq) return;
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

  // HA toggle
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

  // Interval buttons
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

  // Toggle
  toggleBtn?.addEventListener('click', async () => {
    const isOpen = chartPanel.classList.toggle('open');
    toggleBtn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i> Hide Chart' : '<i class="fa-solid fa-chart-area"></i> Chart';
    if (isOpen) {
      setActiveIntervalBtn(activeInterval);
      await ensureChart(activeInterval);
    }
  });
}
