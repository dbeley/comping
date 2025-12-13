(function () {
  let DEBUG = true;
  const log = (...args) => DEBUG && console.log("[rym-lastfm]", ...args);
  const warn = (...args) => console.warn("[rym-lastfm]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const normalize = api.normalize || ((text) => (text || "").toLowerCase().trim());
  const MATCHABLE_TYPES = ["release", "album", "song", "track"];
  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  window.__RYM_LASTFM_DEBUG__ = {
    getCache: () => cache,
    getCacheStats: () => {
      if (!cache?.index) return null;
      return Object.values(cache.index).reduce((acc, item) => {
        const type = item.mediaType || "unknown";
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
    },
    testLookup: (artist, title) => {
      const key = keyFor(artist, title);
      log(`Test lookup - Key: "${key}"`);
      const match = cache?.index?.[key];
      if (match) {
        log("Match found:", match);
        return match;
      }
      log("No match found");
      log("Sample cache keys:", Object.keys(cache?.index || {}).slice(0, 10));
      return null;
    },
    rescan: () => runScan(),
    enableDebug: () => {
      DEBUG = true;
      log("Debug enabled");
    },
    disableDebug: () => {
      DEBUG = false;
      console.log("[rym-lastfm] Debug disabled");
    },
  };

  init().catch((err) => warn("init failed", err));

  async function init() {
    if (!isLastfm()) return;

    settings = await fetchSettings();
    if (!settings?.overlays?.lastfm) {
      log("Overlay disabled in settings");
      return;
    }

    cache = await fetchCache();
    if (!cache?.index) {
      warn("No cache available");
      return;
    }

    injectStyles();
    observe();
    log("Ready - cache entries:", Object.keys(cache.index).length);
  }

  async function fetchSettings() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-settings-get" });
    } catch {
      return { overlays: { lastfm: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch {
      return null;
    }
  }

  function isLastfm() {
    return window.location.hostname.includes("last.fm");
  }

  function observe() {
    scheduleScan(true);
    setInterval(() => scheduleScan(), 3000);
    observer = new MutationObserver((mutations) => {
      const onlyOurAdditions = mutations.every((mutation) => {
        if (mutation.removedNodes?.length) return false;
        return Array.from(mutation.addedNodes).every((node) => {
          return (
            node.nodeType === 1 &&
            (node.classList?.contains("rym-ext-badge-lastfm") ||
              node.querySelector?.(".rym-ext-badge-lastfm"))
          );
        });
      });

      if (onlyOurAdditions) return;

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
    annotateHeader();
    annotateChartlists();
    annotateTopAlbums();
  }

  function annotateHeader() {
    const meta = getPageMeta();
    const titleEl = document.querySelector(".header-new-title");
    if (!titleEl || !meta.name) return;

    const crumbArtist = document.querySelector(".header-new-crumb")?.textContent?.trim() || "";
    const artist = meta.artist || crumbArtist;
    const mediaType = meta.type === "album" ? "release" : meta.type === "track" ? "song" : null;
    if (!mediaType || !artist) return;

    attachBadge(titleEl, artist, meta.name, mediaType);
  }

  function annotateChartlists() {
    const meta = getPageMeta();
    const path = window.location.pathname;
    if (path.includes("/library/artists")) return;

    document.querySelectorAll("tr.chartlist-row").forEach((row, idx) => {
      const nameCell = row.querySelector(".chartlist-name");
      const titleLink = nameCell?.querySelector("a");
      const title = titleLink?.textContent?.trim() || nameCell?.textContent?.trim() || "";

      const artistCell = row.querySelector(".chartlist-artist");
      let artist =
        artistCell?.querySelector("a")?.textContent?.trim() ||
        artistCell?.textContent?.trim() ||
        "";
      if (!artist) {
        artist = meta.artist;
      }

      const target = titleLink || nameCell || row;

      const isAlbumRow = row.hasAttribute("data-album-row") || path.includes("/library/albums");
      const mediaType = isAlbumRow ? "release" : "song";

      if (!title || !artist) {
        if (idx < 3) log("Skipping row - missing data", { title, artist });
        return;
      }

      attachBadge(target, artist, title, mediaType);
    });
  }

  function annotateTopAlbums() {
    const meta = getPageMeta();
    const artist = meta.artist;
    if (!artist) return;

    document.querySelectorAll("#top-albums .artist-top-albums-item").forEach((node, idx) => {
      const nameEl = node.querySelector(".artist-top-albums-item-name");
      const link = nameEl?.querySelector("a");
      const title = link?.textContent?.trim() || nameEl?.textContent?.trim() || "";
      if (!title) {
        if (idx < 2) log("Album item missing title");
        return;
      }

      // Find the parent container that has the image
      const container = node.closest(".artist-top-albums-item-wrap") || node;
      attachBadgeToAlbum(container, artist, title);
    });
  }

  function attachBadgeToAlbum(container, artist, title) {
    if (!title || !title.trim()) return;

    const key = keyFor(artist, title);
    if (!key || !key.trim()) return;

    const existing = container.querySelector(".rym-ext-badge-lastfm");
    if (existing?.dataset?.rymKey === key) {
      return;
    }
    if (existing) {
      existing.remove();
    }

    const match = cache.index[key];
    if (!match) {
      if (Math.random() < 0.05) {
        log(`No match for: "${artist}" - "${title}" (key: "${key}")`);
      }
      return;
    }

    if (!isMatchable(match, "release")) {
      log(`✗ Type mismatch: "${title}" is ${match.mediaType}, expected release`);
      return;
    }

    if (container.querySelector(".rym-ext-badge-lastfm")) return;

    const badge = buildBadge(match);
    badge.classList.add("rym-ext-badge-album-overlay");
    container.style.position = "relative";
    container.appendChild(badge);
    log(`✓ badge: "${artist}" - "${title}" → ${match.ratingValue}`);
  }

  function getPageMeta() {
    const node = document.querySelector("[data-page-resource-type]");
    const type = node?.getAttribute("data-page-resource-type") || "";
    const name = node?.getAttribute("data-page-resource-name") || "";
    let artist = node?.getAttribute("data-page-resource-artist-name") || "";
    if (!artist && type === "artist") {
      artist = name;
    }
    return {
      type,
      name,
      artist,
    };
  }

  function attachBadge(target, artist, title, mediaType = "release") {
    if (!title || !title.trim()) return;

    const key = keyFor(artist, title);
    if (!key || !key.trim()) return;

    const existing = target.querySelector(".rym-ext-badge-lastfm");
    if (existing?.dataset?.rymKey === key) {
      return;
    }
    if (existing) {
      existing.remove();
    }

    const match = cache.index[key];
    if (!match) {
      if (Math.random() < 0.05) {
        log(`No match for: "${artist}" - "${title}" (key: "${key}")`);
      }
      return;
    }

    if (!isMatchable(match, mediaType)) {
      log(`✗ Type mismatch: "${title}" is ${match.mediaType}, expected ${mediaType}`);
      return;
    }

    if (target.querySelector(".rym-ext-badge-lastfm")) return;

    const badge = buildBadge(match);
    target.appendChild(badge);
    log(`✓ badge: "${artist}" - "${title}" → ${match.ratingValue}`);
  }

  function isMatchable(match, preferredType = null) {
    const matchType = match.mediaType || "release";
    if (preferredType) {
      if (preferredType === "release") return matchType === "release" || matchType === "album";
      if (preferredType === "song") return matchType === "song" || matchType === "track";
      return matchType === preferredType;
    }
    return MATCHABLE_TYPES.includes(matchType);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-lastfm";
    const keyArtist = match.artist || match.album || "";
    const keyTitle = match.name || match.album || "";
    link.dataset.rymKey = keyFor(keyArtist, keyTitle);
    const rating = match.ratingValue || "?";
    link.textContent = `RYM ${rating}`;
    link.title = buildTooltip(match);

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

  function buildTooltip(match) {
    const bits = [];
    if (match.ratingValue) {
      bits.push(`Rating: ${match.ratingValue}${match.maxRating ? "/" + match.maxRating : ""}`);
    }
    if (match.ratingCount) bits.push(`Ratings: ${match.ratingCount}`);
    if (match.reviewCount) bits.push(`Reviews: ${match.reviewCount}`);
    if (match.updatedAt) bits.push(`Cached: ${match.updatedAt}`);
    if (match.url) bits.push(`Source: ${match.url}`);
    return bits.join(" · ");
  }

  function getRatingColor(rating) {
    const clamped = Math.max(0, Math.min(5, rating));
    let normalized;

    if (clamped < 3.0) {
      normalized = clamped / 3 / 6;
    } else if (clamped < 4.0) {
      normalized = 0.5 + ((clamped - 3) / 1) * 0.35;
    } else {
      normalized = 0.85 + ((clamped - 4) / 1) * 0.15;
    }

    const hue = 120 * normalized;
    return { bg: `hsl(${hue}deg 65% 35%)`, fg: "#fff" };
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .rym-ext-badge {
        margin-left: 6px;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        vertical-align: middle;
        cursor: default;
        display: inline-flex;
        align-items: center;
        white-space: nowrap;
      }
      .rym-ext-badge-lastfm {
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }
      .chartlist-name .rym-ext-badge-lastfm {
        font-size: 10px;
        padding: 2px 6px;
      }
      .artist-top-albums-item-name .rym-ext-badge-lastfm {
        font-size: 11px;
        padding: 3px 7px;
      }
      .header-new-title .rym-ext-badge-lastfm {
        font-size: 12px;
        padding: 4px 8px;
        margin-left: 10px;
      }
      .rym-ext-badge-album-overlay {
        position: absolute;
        top: 6px;
        right: 6px;
        margin-left: 0;
        z-index: 10;
        font-size: 11px;
        padding: 4px 8px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .rym-ext-badge-album-overlay:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      }
    `;
    document.documentElement.appendChild(style);
  }
})();
