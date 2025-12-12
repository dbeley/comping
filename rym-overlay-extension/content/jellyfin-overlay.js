(function () {
  let DEBUG = true; // Set to false to reduce console noise
  const log = (...args) => DEBUG && console.log("[rym-jellyfin]", ...args);
  const warn = (...args) => console.warn("[rym-jellyfin]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const MATCH_MEDIA_TYPE = "film";

  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  // Expose debug helpers for manual testing
  window.__RYM_JELLYFIN_DEBUG__ = {
    rescan: () => runScan(),
    getCache: () => cache,
    getCacheStats: () => summarizeCache(cache),
    enableDebug: () => {
      DEBUG = true;
      log("Debug enabled");
    },
    disableDebug: () => {
      DEBUG = false;
      console.log("[rym-jellyfin] Debug disabled");
    },
  };

  init().catch((err) => warn("init failed", err));

  async function init() {
    log("Initializing...");
    if (!isJellyfin()) {
      log("Not a Jellyfin page");
      return;
    }
    log("Jellyfin detected");

    settings = await fetchSettings();
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

  async function fetchSettings() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-settings-get" });
    } catch {
      return { overlays: { jellyfin: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch {
      return null;
    }
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
    scheduleScan(true);
    observer = new MutationObserver((mutations) => {
      const isBadgeMutation = mutations.every((mutation) => {
        return Array.from(mutation.addedNodes).every((node) => {
          return (
            node.nodeType === 1 &&
            (node.classList?.contains("rym-ext-badge-jellyfin") ||
              node.querySelector?.(".rym-ext-badge-jellyfin"))
          );
        });
      });

      if (isBadgeMutation) {
        return;
      }

      needsFullScan = true;
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleScan(full = false) {
    if (full) needsFullScan = true;
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      if (needsFullScan) {
        needsFullScan = false;
        runScan();
      }
    });
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
      const badge = buildBadge(match);
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

  function isFilmMatch(match, yearHint) {
    const type = (match.mediaType || "").toLowerCase();
    if (type !== MATCH_MEDIA_TYPE && type !== "movie") return false;
    if (!yearHint || !match.releaseDate) return true;
    return match.releaseDate.includes(yearHint);
  }

  function buildBadge(match) {
    const el = document.createElement(match.url ? "a" : "span");
    el.className = "rym-ext-badge rym-ext-badge-jellyfin";
    const rating = match.ratingValue || "?";
    el.textContent = `RYM ${rating}`;
    el.title = buildTooltip(match);

    const ratingNum = parseFloat(rating);
    if (!isNaN(ratingNum)) {
      const color = getRatingColor(ratingNum);
      el.style.background = color.bg;
      el.style.color = color.fg;
    }

    if (match.url) {
      el.href = match.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }

    return el;
  }

  function getRatingColor(rating) {
    const clamped = Math.max(0, Math.min(5, rating));
    const normalized = clamped / 5; // 0-1
    const hue = 20 + normalized * 110; // red-ish to green-ish
    const saturation = 75;
    const lightness = 48 - normalized * 8;
    return {
      bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      fg: "#ffffff",
    };
  }

  function buildTooltip(match) {
    const bits = [];
    const title = match.name || "Unknown title";
    const directors = match.directors || match.artist || "";
    bits.push(directors ? `${title} — ${directors}` : title);
    if (match.ratingValue) {
      bits.push(`Rating: ${match.ratingValue}${match.maxRating ? "/" + match.maxRating : ""}`);
    }
    if (match.ratingCount) bits.push(`Ratings: ${match.ratingCount}`);
    if (match.reviewCount) bits.push(`Reviews: ${match.reviewCount}`);
    if (match.releaseDate) bits.push(`Year: ${match.releaseDate}`);
    if (match.updatedAt) bits.push(`Cached: ${match.updatedAt}`);
    return bits.join(" · ");
  }

  function summarizeCache(currentCache) {
    if (!currentCache?.index) return null;
    return Object.values(currentCache.index).reduce((acc, item) => {
      const type = item.mediaType || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
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

  function text(node) {
    if (!node) return "";
    return (node.textContent || "").replace(/\s+/g, " ").trim();
  }
})();
