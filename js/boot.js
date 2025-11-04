import config from '../config/config.js';

(function applyTheme(cfg){
  try {
    const vars = cfg?.theme || {};
    const root = document.documentElement;
    Object.keys(vars).forEach(k => {
      const val = String(vars[k] ?? '').replace(/;+\s*$/,'');
      root.style.setProperty(k, val);
    });

    // Apply font variables if provided
    const fonts = cfg?.fonts || {};
    if (fonts.body) root.style.setProperty('--font-body', fonts.body);
    if (fonts.projectName) root.style.setProperty('--font-project-name', fonts.projectName);
    if (fonts.stats) root.style.setProperty('--font-stats', fonts.stats);

    // Apply background derived from config only
    const bg = cfg?.background || {};
    // Decide the solid layer color from config.background if provided, otherwise theme --bg-dark
    const fallbackDark = vars['--bg-dark'] || getComputedStyle(root).getPropertyValue('--bg-dark') || '#0E1621';
    const solid = (bg.type === 'color' && bg.color) ? bg.color : String(fallbackDark).trim();
    root.style.setProperty('--bg-solid', solid);
    // Respect overlayOpacity if provided (for both color and video modes)
    const overlay = document.querySelector('.overlay');
    if (overlay) {
      const o = (typeof bg.overlayOpacity === 'number') ? bg.overlayOpacity : 0.4;
      overlay.style.background = `rgba(14,22,33,${Math.max(0, Math.min(1, o))})`;
    }
  } catch {}
})(config);

// Expose config globally for legacy code to read
window.TOKEN_DOCK_CONFIG = config;

// Attempt to bust stale module cache and refresh config once per load
try {
  const stamp = Date.now();
  import(`../config/config.js?ts=${stamp}`).then(mod => {
    if (mod && mod.default) {
      const fresh = mod.default;
      const prev = window.TOKEN_DOCK_CONFIG || {};
      // Shallow compare a couple of keys that matter for badges/features
      const changed = (
        JSON.stringify(prev.token || {}) !== JSON.stringify(fresh.token || {}) ||
        JSON.stringify(prev.features || {}) !== JSON.stringify(fresh.features || {})
      );
      if (changed) {
        window.TOKEN_DOCK_CONFIG = fresh;
        document.dispatchEvent(new CustomEvent('config-updated', { detail: { fresh } }));
      }
    }
  }).catch(()=>{});
} catch {}

(function hydrateHeader(cfg){
  try {
    const logoEl = document.getElementById('projectLogo');
    if (logoEl && cfg?.branding?.logoUrl) {
      logoEl.src = cfg.branding.logoUrl;
    }
    const nameEl = document.getElementById('projectName');
    if (nameEl && cfg?.projectName) {
      nameEl.textContent = cfg.projectName;
    }
    const taglineEl = document.getElementById('projectTagline');
    if (taglineEl && typeof cfg?.tagline === 'string') {
      taglineEl.textContent = cfg.tagline;
    }
    const missionEl = document.getElementById('projectMission');
    if (missionEl && typeof cfg?.mission === 'string' && cfg.mission.trim().length) {
      missionEl.textContent = cfg.mission;
      missionEl.style.display = 'block';
    }
  } catch {}
})(config);

(function hydrateSocials(cfg){
  try {
    const socialsEl = document.getElementById('socialLinks');
    if (!socialsEl) return;
    const links = [];
    const s = cfg?.socials || {};
    if (s.twitter) links.push(`<a href="${s.twitter}" target="_blank" class="social-link"><i class="fab fa-twitter"></i></a>`);
    if (s.telegram) links.push(`<a href="${s.telegram}" target="_blank" class="social-link"><i class="fab fa-telegram"></i></a>`);
    if (s.website) links.push(`<a href="${s.website}" target="_blank" class="social-link"><i class="fa-solid fa-desktop"></i></a>`);
    if (s.medium) links.push(`<a href="${s.medium}" target="_blank" class="social-link"><i class="fab fa-medium"></i></a>`);
    if (s.github) links.push(`<a href="${s.github}" target="_blank" class="social-link"><i class="fab fa-github"></i></a>`);
    if (s.instagram) links.push(`<a href="${s.instagram}" target="_blank" class="social-link"><i class="fab fa-instagram"></i></a>`);
    if (links.length) {
      socialsEl.innerHTML = links.join('');
      socialsEl.style.display = 'flex';
    }
  } catch {}
})(config);

// Nothing else here. The legacy page script (dock-address.js) will read the global config
// to resolve address/chain and render the rest. This keeps the change minimal for now.

// Optional background video injection
(function applyBackgroundMedia(cfg){
  try {
    const bg = cfg?.background || {};
    // Remove any previously injected video element
    const old = document.querySelector('.video-background');
    if (old && old.remove) old.remove();

    if (bg.type === 'video' && bg.videoUrl) {
      // Ensure the solid layer is transparent so video shows through
      document.documentElement.style.setProperty('--bg-solid', 'transparent');
      // Dim overlay less to reveal more of the video
      const overlay = document.querySelector('.overlay');
      if (overlay) {
        const o = (typeof bg.overlayOpacity === 'number') ? bg.overlayOpacity : 0.4;
        overlay.style.background = `rgba(14,22,33,${Math.max(0, Math.min(1, o))})`;
      }

      const v = document.createElement('video');
      v.className = 'video-background';
      v.autoplay = true;
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      if (bg.opacity != null) v.style.opacity = String(bg.opacity);
      if (bg.filter) v.style.filter = bg.filter;

      const src = document.createElement('source');
      src.src = bg.videoUrl;
      src.type = 'video/mp4';
      v.appendChild(src);

      document.body.prepend(v);
    }
  } catch {}
})(config);

// Modular chart lazy loader
(function setupModularChart() {
  const cfg = window.TOKEN_DOCK_CONFIG || {};
  const features = cfg.features || {};
  if (features.modularChart !== true) return;

  let mounted = false;
  async function ensureMount() {
    if (mounted) return;
    try {
      const mod = await import('../modules/chart/chart.js');
      await mod.mount();
      mounted = true;
    } catch {}
  }

  // Try after DOMContentLoaded (after legacy render builds the DOM)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(ensureMount, 0));
  } else {
    setTimeout(ensureMount, 0);
  }

  // Also lazy-load on first interaction with chart toggle
  document.addEventListener('click', (e) => {
    const btn = e.target.closest?.('#toggleChart');
    if (btn) ensureMount();
  }, { once: false, passive: true });
})();
