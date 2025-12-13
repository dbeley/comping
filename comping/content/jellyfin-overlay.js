(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const fetchSettings = api.fetchSettings;
  const fetchCache = api.fetchCache;
  const getCacheStats = api.getCacheStats;
  const createDebugger = api.createDebugger;
  const createBadgeAwareMutationObserver = api.createBadgeAwareMutationObserver;
  const createScanScheduler = api.createScanScheduler;
  const buildBadge = api.buildBadge;
  const isFilmMatch = api.isFilmMatch;
  const text = api.text;
  const ColorSchemes = api.ColorSchemes;

  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanner = null;

  const debug = createDebugger("rym-jellyfin", {
    rescan: () => runScan(),
    getCache: () => cache,
    getCacheStats: () => getCacheStats(cache),
  });
  const log = debug.log;
  const warn = debug.warn;

  window.__RYM_JELLYFIN_DEBUG__ = debug;

  init().catch((err) => warn("init failed", err));

  async function init() {
    log("Initializing...");
    if (!isJellyfin()) {
      log("Not a Jellyfin page");
      return;
    }
    log("Jellyfin detected");

    settings = await fetchSettings({ overlays: { jellyfin: true } });
    if (!settings.overlays?.jellyfin) {
      log("Jellyfin overlay disabled in settings");
      return;
    }

    cache = await fetchCache();
    log("Cache loaded, entries:", cache ? Object.keys(cache.index || {}).length : 0);
    if (!cache?.index) {
      warn("No cache available");
      return;
    }

    injectStyles();
    observe();
    log("Initialization complete");
  }

  function isJellyfin() {
    if (document.querySelector('meta[name="application-name"][content="Jellyfin"]')) {
      return true;
    }
    if (/jellyfin/i.test(window.location.hostname)) {
      return true;
    }
    return Boolean(document.querySelector('script[src*="jellyfin"], link[href*="jellyfin"]'));
  }

  function observe() {
    scanner = createScanScheduler(runScan);
    scanner.schedule(true);

    observer = createBadgeAwareMutationObserver("rym-ext-badge-jellyfin", () => {
      scanner.schedule(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function runScan() {
    annotateMovieCards();
  }

  function annotateMovieCards() {
    const cards = document.querySelectorAll(
      '.card[data-type="Movie"], .card[data-mediatype="Video"][data-context="movies"]'
    );
    cards.forEach((card, idx) => {
      card.querySelectorAll(".rym-ext-badge-jellyfin").forEach((b) => b.remove());

      const info = extractCardInfo(card);
      if (!info.title) {
        if (idx < 3) log("No title found for card", card);
        return;
      }

      const match = findMatch(info);
      if (!match) {
        if (idx < 3) log(`No match for "${info.title}"`);
        return;
      }

      const target = card.querySelector(".cardScalable, .cardImageContainer, .cardBox") || card;
      if (!target) return;

      target.classList.add("rym-ext-jellyfin-container");

      const badge = buildBadge(match, {
        className: "rym-ext-badge rym-ext-badge-jellyfin",
        prefix: "RYM",
        colorScheme: ColorSchemes.LINEAR,
        includeTitle: true,
      });

      target.appendChild(badge);
      if (idx < 3) {
        log(`✓ BADGE ATTACHED: "${info.title}" → ${match.ratingValue || "?"}`);
      }
    });
  }

  function extractCardInfo(card) {
    const imageLink = card.querySelector(".cardImageContainer");
    const titleFromLabel = imageLink?.getAttribute("aria-label") || "";
    const titleFromText = text(card.querySelector(".cardText-first"));
    const title = titleFromLabel || titleFromText;
    const year = text(card.querySelector(".cardText-secondary"));
    return { title, year };
  }

  function findMatch(info) {
    if (!cache?.index || !info.title) return null;
    const keys = [keyFor("", info.title)];
    for (const key of keys) {
      const match = cache.index[key];
      if (match && isFilmMatch(match, info.year)) {
        return match;
      }
    }
    return null;
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .rym-ext-jellyfin-container {
        position: relative;
      }
      .rym-ext-badge {
        font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .rym-ext-badge-jellyfin {
        position: absolute;
        top: 6px;
        left: 6px;
        padding: 4px 8px;
        border-radius: 12px;
        background: rgba(35, 35, 35, 0.85);
        color: #fff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
        z-index: 12;
        text-decoration: none;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .rym-ext-badge-jellyfin:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      }
    `;
    document.head.appendChild(style);
  }
})();
