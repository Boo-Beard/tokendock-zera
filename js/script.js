/* ========= INIT ========= */
function initializeProject() {
  // Text & media
  document.title = `${PROJECT_CONFIG.name} Dock | TokenDock`;
  document.getElementById('projectName').textContent = PROJECT_CONFIG.name;
  document.getElementById('displayProjectName').textContent = PROJECT_CONFIG.name;
  document.getElementById('tradeProjectName').textContent = PROJECT_CONFIG.name;
  document.getElementById('projectTagline').textContent = PROJECT_CONFIG.tagline;
  document.getElementById('projectMission').textContent = PROJECT_CONFIG.mission;
  document.getElementById('projectLogo').src = PROJECT_CONFIG.logoUrl;

  // Links
  document.getElementById('tradeLink').href = PROJECT_CONFIG.tradeUrl;
  document.getElementById('chartLink').href = PROJECT_CONFIG.chartUrl;
  document.getElementById('docsLink').href = PROJECT_CONFIG.docsUrl;
  document.getElementById('websiteLink').href = PROJECT_CONFIG.websiteUrl;
  document.getElementById('chainLink').href = PROJECT_CONFIG.chainExplorerUrl;

  // Socials
  document.querySelector('.social-links').innerHTML = PROJECT_CONFIG.socialLinks
    .map(s => `<a href="${s.url}" class="social-link" target="_blank" rel="noopener noreferrer"><i class="${s.icon}"></i></a>`)
    .join('');
}

/* ========= DATA FETCH / RENDER ========= */
async function loadProjectStats() {
  const priceEl = document.getElementById('price');
  const mcapEl = document.getElementById('mcap');
  const volEl = document.getElementById('volume');
  const changeEl = document.getElementById('change');
  const holderEl = document.getElementById('holderCount');
  const lastUpdatedEl = document.getElementById('lastUpdated');
  const solPriceEl = document.getElementById('solPrice');

  // Proper canvas sizing for crisp sparkline
  const canvas = document.getElementById('priceTrend');
  canvas.width = canvas.offsetWidth;
  canvas.height = 50;

  function abbreviateNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2).replace(/\.?0+$/, '') + 'K';
    return (Number(num) || 0).toLocaleString();
  }

  function formatPrice(p) {
    const price = Number(p || 0);
    if (price >= 1) return `$${price.toFixed(2).replace(/\.?0+$/, '')}`;
    if (price >= 0.01) return `$${price.toFixed(3).replace(/\.?0+$/, '')}`;
    return `$${price.toFixed(4).replace(/\.?0+$/, '')}`;
  }

  try {
    // Token stats
    const res = await fetch(`https://dock-habitat.vercel.app/api/birdeye?token=${encodeURIComponent(PROJECT_CONFIG.contractAddress)}`);

    // SOL price (best-effort)
    try {
      const solRes = await fetch(`https://dock-habitat.vercel.app/api/birdeye?token=sol`);
      if (solRes.ok) {
        const solJson = await solRes.json();
        const sol = solJson?.data;
        if (sol && sol.price != null) solPriceEl.textContent = `$${Number(sol.price).toFixed(2)}`;
      }
    } catch (_) { solPriceEl.textContent = '—'; }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success || !json.data) throw new Error('Bad payload');

    const d = json.data;

    // Price + change
    const ch24 = Number(d.priceChange24hPercent || 0);
    const arrow = ch24 >= 0 ? "▲" : "▼";
    const arrowColor = ch24 >= 0 ? "#0EB466" : "#ff4d4d";

    priceEl.innerHTML = `${formatPrice(d.price)} <span style="color:${arrowColor}; font-size:0.8rem; margin-left:4px;">${arrow}</span>`;
    changeEl.textContent = `${ch24.toFixed(2)}%`;
    changeEl.style.color = arrowColor;

    // Sparkline
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const points = [
      d.history24hPrice, d.history12hPrice, d.history8hPrice,
      d.history4hPrice, d.history2hPrice, d.history1hPrice, d.price
    ].map(Number).filter(p => !isNaN(p));

    if (points.length > 1) {
      const min = Math.min(...points);
      const max = Math.max(...points);
      const scaleX = canvas.width / (points.length - 1 || 1);
      const scaleY = (max - min) === 0 ? 0 : canvas.height / (max - min);
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, ch24 >= 0 ? "rgba(14,180,102,0)" : "rgba(255,77,77,0)");
      gradient.addColorStop(0.5, ch24 >= 0 ? "rgba(14,180,102,1)" : "rgba(255,77,77,1)");
      gradient.addColorStop(1, ch24 >= 0 ? "rgba(14,180,102,0)" : "rgba(255,77,77,0)");

      ctx.beginPath();
      ctx.lineWidth = 5;
      ctx.strokeStyle = gradient;
      ctx.shadowBlur = 8;
      ctx.shadowColor = ch24 >= 0 ? "rgba(14,180,102,0.6)" : "rgba(255,77,77,0.6)";
      points.forEach((p, i) => {
        const x = i * scaleX;
        const y = canvas.height - ((p - min) * scaleY);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    // Other stats
    mcapEl.textContent = `$${abbreviateNumber(d.marketCap)}`;
    volEl.textContent = `$${abbreviateNumber(d.v24hUSD)}`;
    holderEl.textContent = (Number(d.holder) || 0).toLocaleString();
    lastUpdatedEl.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

  } catch (err) {
    priceEl.textContent = mcapEl.textContent = volEl.textContent = holderEl.textContent = "Error";
    console.error(err);
  }
}

/* ========= COPY CONTRACT ========= */
const copyBtn = document.getElementById('copyCA');
copyBtn.addEventListener('click', async () => {
  const notification = document.getElementById('notification');
  try {
    await navigator.clipboard.writeText(PROJECT_CONFIG.contractAddress);
    copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> CA Copied';
    copyBtn.style.color = '#0EB466';
    setTimeout(() => {
      copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
      copyBtn.style.color = 'var(--primary)';
    }, 1800);
  } catch (err) {
    console.error('Clipboard failed:', err);
    notification.querySelector('p').innerHTML = "⚠️ Failed to copy address.";
    notification.classList.add('show');
    setTimeout(() => notification.classList.remove('show'), 1800);
  }
});

/* ========= REFRESH ========= */
const refreshBtn = document.getElementById('refreshStats');
refreshBtn.addEventListener('click', async () => {
  refreshBtn.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> Refreshing...`;
  await loadProjectStats();
  setTimeout(() => {
    refreshBtn.innerHTML = `<i class="fas fa-sync-alt"></i> Refresh`;
  }, 600);
});

/* ========= BOOT ========= */
document.addEventListener('DOMContentLoaded', () => {
  initializeProject();
  loadProjectStats();
});