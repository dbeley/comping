(function () {
  let DEBUG = true; // Set to false to disable debug logging
  const log = (...args) => DEBUG && console.log("[glitchwave-steam]", ...args);
  const warn = (...args) => console.warn("[glitchwave-steam]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  // Expose debug helpers to window for manual testing
  window.__GLITCHWAVE_STEAM_DEBUG__ = {
    getCache: () => cache,
    getCacheStats: () => {
      if (!cache?.index) return null;
      return Object.values(cache.index).reduce((acc, item) => {
        const type = item.mediaType || "unknown";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
    },
    testLookup: (title) => {
      const key = keyFor("", title); // Games typically don't have an "artist"
      log(`Test lookup - Key: "${key}"`);
      const match = cache?.index[key];
      if (match) {
        log("Match found:", match);
        return match;
      } else {
        log("No match found");
        log("Sample cache keys:", Object.keys(cache?.index || {}).slice(0, 10));
        return null;
      }
    },
    searchCache: (searchTerm) => {
      if (!cache?.index) return [];
      const results = [];
      for (const [key, value] of Object.entries(cache.index)) {
        if (
          key.toLowerCase().includes(searchTerm.toLowerCase()) ||
          value.name?.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          results.push({ key, ...value });
        }
      }
      log(`Found ${results.length} matches for "${searchTerm}"`);
      return results;
    },
    rescan: () => runScan(),
    enableDebug: () => {
      DEBUG = true;
      log("Debug enabled");
    },
    disableDebug: () => {
      DEBUG = false;
      console.log("[glitchwave-steam] Debug disabled");
    },
  };

  init().catch((err) => warn("init failed", err));

  async function init() {
    log("Initializing...");
    if (!isSteam()) {
      log("Not a Steam page");
      return;
    }
    log("Steam detected");

    settings = await fetchSettings();
    log("Settings:", settings);
    if (!settings.overlays?.steam) {
      log("Steam overlay disabled in settings");
      return;
    }

    cache = await fetchCache();
    log("Cache loaded, entries:", cache ? Object.keys(cache.index || {}).length : 0);
    if (!cache || !cache.index) {
      warn("No cache available");
      return;
    }

    // Log some cache stats
    const cacheStats = Object.values(cache.index).reduce((acc, item) => {
      const type = item.mediaType || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
    log("Cache stats by mediaType:", cacheStats);

    injectStyles();
    observe();
    log("Initialization complete");
  }

  async function fetchSettings() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-settings-get" });
    } catch {
      return { overlays: { steam: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch {
      return null;
    }
  }

  function isSteam() {
    return (
      window.location.hostname.includes("steampowered.com") ||
      window.location.hostname.includes("store.steampowered.com")
    );
  }

  function observe() {
    scheduleScan(true);
    observer = new MutationObserver((mutations) => {
      // Ignore mutations caused by our own badge additions
      const isBadgeMutation = mutations.every((mutation) => {
        return Array.from(mutation.addedNodes).every((node) => {
          return (
            node.nodeType === 1 &&
            (node.classList?.contains("gw-ext-badge") || node.querySelector?.(".gw-ext-badge"))
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
    log("Running scan on:", window.location.pathname);
    annotateGameCards();
    annotateGamePage();
    annotateSearchResults();
  }

  function annotateGameCards() {
    // Homepage game cards (.store_capsule)
    const cards = document.querySelectorAll(".store_capsule");
    log(`Found ${cards.length} game cards on homepage`);

    cards.forEach((card, idx) => {
      // Remove existing badges
      card.querySelectorAll(".gw-ext-badge").forEach((b) => b.remove());

      // Get game title from image alt
      const img = card.querySelector(".capsule img, img");
      const title = (img?.alt || img?.getAttribute("alt") || "").trim();

      if (!title) {
        if (idx < 3) log(`Card ${idx}: No title found`);
        return;
      }

      if (idx < 3) {
        log(`Game card ${idx}:`, { title });
      }

      // Find the capsule image container
      const capsule = card.querySelector(".capsule, .capsule_image_ctn") || card;

      // Ensure the container has position relative for absolute positioning
      if (capsule.style.position !== "absolute") {
        capsule.style.position = "relative";
      }

      attachBadge(capsule, title);
    });
  }

  function annotateGamePage() {
    // Game page title (#appHubAppName)
    const titleEl = document.querySelector("#appHubAppName");
    if (!titleEl) return;

    // Remove existing badges
    titleEl.querySelectorAll(".gw-ext-badge").forEach((b) => b.remove());

    const title = titleEl.textContent?.trim() || "";
    if (!title) return;

    log("Game page:", { title });

    // Attach badge after the title
    attachBadge(titleEl, title);
  }

  function annotateSearchResults() {
    // Search results (.search_result_row)
    const results = document.querySelectorAll(".search_result_row");
    log(`Found ${results.length} search results`);

    results.forEach((result, idx) => {
      // Remove existing badges
      result.querySelectorAll(".gw-ext-badge").forEach((b) => b.remove());

      // Get game title from .search_name .title
      const titleEl = result.querySelector(".search_name .title");
      const title = titleEl?.textContent?.trim() || "";

      if (!title) {
        if (idx < 3) log(`Result ${idx}: No title found`);
        return;
      }

      if (idx < 3) {
        log(`Search result ${idx}:`, { title });
      }

      // Find the capsule image container
      const capsule = result.querySelector(".search_capsule");
      if (!capsule) return;

      // Ensure the container has position relative for absolute positioning
      if (capsule.style.position !== "absolute") {
        capsule.style.position = "relative";
      }

      attachBadge(capsule, title);
    });
  }

  function attachBadge(target, title) {
    if (!title || !title.trim()) {
      return;
    }

    // For games, typically no "artist" - just use the title
    const key = keyFor("", title);
    if (!key || !key.trim()) {
      return;
    }

    const match = cache.index[key];
    if (!match) {
      // Only log 5% of misses to avoid spam
      if (Math.random() < 0.05) {
        log(`No match for: "${title}" (key: "${key}")`);
      }
      return;
    }

    // Check if this is the right type of media (game/videogame)
    const matchType = match.mediaType || "";
    if (matchType && !["game", "videogame", "video-game"].includes(matchType.toLowerCase())) {
      return;
    }

    // Don't add duplicate badges
    if (target.querySelector(".gw-ext-badge")) {
      return;
    }

    const badge = buildBadge(match);
    target.appendChild(badge);
    log(`✓ "${title}" → ${match.ratingValue}`);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "gw-ext-badge gw-ext-badge-steam";
    const rating = match.ratingValue || "?";
    link.textContent = `GW ${rating}`;
    link.title = buildTooltip(match);

    // Apply gradient color based on rating (0-5 scale, same as Navidrome)
    const ratingNum = parseFloat(rating);
    if (!isNaN(ratingNum)) {
      const color = getRatingColor(ratingNum);
      link.style.background = color.bg;
      link.style.color = color.fg;
    }

    if (match.url) {
      link.href = match.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.textDecoration = "none";
    }
    return link;
  }

  function getRatingColor(rating) {
    // Same progressive gradient as Navidrome
    // AGGRESSIVE compression 0-3, VERY PROGRESSIVE 3-4, compressed 4-5

    const clampedRating = Math.max(0, Math.min(5, rating));
    let normalizedValue;

    if (clampedRating < 3.0) {
      // AGGRESSIVE compress: 0-3 maps to 0-0.1 (only 10% of gradient)
      normalizedValue = (clampedRating / 3.0) * 0.1;
    } else if (clampedRating < 4.0) {
      // VERY PROGRESSIVE expand: 3-4 maps to 0.1-0.8 (70% of gradient!)
      normalizedValue = 0.1 + ((clampedRating - 3.0) / 1.0) * 0.7;
    } else {
      // Compress high range: 4-5 maps to 0.8-1.0 (20% of gradient)
      normalizedValue = 0.8 + ((clampedRating - 4.0) / 1.0) * 0.2;
    }

    // Map to hue: 0 (red) to 180 (cyan)
    const hue = normalizedValue * 180;

    // Adjust saturation and lightness for better contrast
    const saturation = 70 + normalizedValue * 15; // 70-85%
    const lightness = 52 - normalizedValue * 10; // 52-42%

    return {
      bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      fg: "#ffffff",
    };
  }

  function buildTooltip(match) {
    const bits = [];
    bits.push(`${match.name}`);
    if (match.ratingValue) {
      bits.push(`Rating: ${match.ratingValue}${match.maxRating ? "/" + match.maxRating : ""}`);
    }
    if (match.ratingCount) bits.push(`Ratings: ${match.ratingCount}`);
    if (match.reviewCount) bits.push(`Reviews: ${match.reviewCount}`);
    if (match.updatedAt) bits.push(`Cached: ${match.updatedAt}`);
    if (match.url) bits.push(`Source: ${match.url}`);
    return bits.join(" · ");
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .gw-ext-badge {
        padding: 3px 6px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        cursor: default;
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      .gw-ext-badge-steam {
        /* Background and color set dynamically based on rating */
      }
      /* Badge on game cards - top-right corner */
      .store_capsule .gw-ext-badge,
      .search_capsule .gw-ext-badge {
        position: absolute !important;
        top: 4px;
        right: 4px;
        margin: 0;
        font-size: 9px;
        padding: 3px 6px;
        z-index: 100;
        opacity: 1 !important;
        visibility: visible !important;
      }
      /* Badge on game page title */
      #appHubAppName .gw-ext-badge {
        margin-left: 10px;
        font-size: 12px;
        padding: 4px 8px;
        vertical-align: middle;
      }
    `;
    document.documentElement.appendChild(style);
    styleInjected = true;
  }
})();
