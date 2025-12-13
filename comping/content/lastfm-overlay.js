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
  const isMatchable = api.isMatchable;
  const ColorSchemes = api.ColorSchemes;

  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanner = null;

  const debug = createDebugger("rym-lastfm", {
    getCache: () => cache,
    getCacheStats: () => getCacheStats(cache),
    testLookup: (artist, title) => {
      const key = keyFor(artist, title);
      debug.log(`Test lookup - Key: "${key}"`);
      const match = cache?.index?.[key];
      if (match) {
        debug.log("Match found:", match);
        return match;
      }
      debug.log("No match found");
      debug.log("Sample cache keys:", Object.keys(cache?.index || {}).slice(0, 10));
      return null;
    },
    rescan: () => runScan(),
  });
  const log = debug.log;
  const warn = debug.warn;

  window.__RYM_LASTFM_DEBUG__ = debug;

  init().catch((err) => warn("init failed", err));

  async function init() {
    if (!isLastfm()) return;

    settings = await fetchSettings({ overlays: { lastfm: true } });
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

  function isLastfm() {
    return window.location.hostname.includes("last.fm");
  }

  function observe() {
    scanner = createScanScheduler(runScan);
    scanner.schedule(true);

    setInterval(() => scanner.schedule(), 3000);

    observer = createBadgeAwareMutationObserver("rym-ext-badge-lastfm", () => {
      scanner.schedule(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
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

    const badge = buildBadge(match, {
      className: "rym-ext-badge rym-ext-badge-lastfm rym-ext-badge-album-overlay",
      prefix: "RYM",
      key: key,
      colorScheme: ColorSchemes.PROGRESSIVE,
    });

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

    const badge = buildBadge(match, {
      className: "rym-ext-badge rym-ext-badge-lastfm",
      prefix: "RYM",
      key: key,
      colorScheme: ColorSchemes.PROGRESSIVE,
    });

    target.appendChild(badge);
    log(`✓ badge: "${artist}" - "${title}" → ${match.ratingValue}`);
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
