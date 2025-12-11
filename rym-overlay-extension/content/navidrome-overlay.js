(function () {
  let DEBUG = true; // Set to false to disable debug logging
  const log = (...args) => DEBUG && console.log("[rym-navidrome]", ...args);
  const warn = (...args) => console.warn("[rym-navidrome]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const MATCHABLE_TYPES = ["release", "song"];
  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  // Expose debug helpers to window for manual testing
  window.__RYM_NAVIDROME_DEBUG__ = {
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
          value.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          value.artist?.toLowerCase().includes(searchTerm.toLowerCase())
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
      console.log("[rym-navidrome] Debug disabled");
    },
  };

  init().catch((err) => warn("init failed", err));

  async function init() {
    log("Initializing...");
    if (!isNavidrome()) {
      log("Not a Navidrome page");
      return;
    }
    log("Navidrome detected");

    settings = await fetchSettings();
    log("Settings:", settings);
    if (!settings.overlays?.navidrome) {
      log("Navidrome overlay disabled in settings");
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
      return { overlays: { navidrome: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch {
      return null;
    }
  }

  function isNavidrome() {
    return Boolean(window.__APP_CONFIG__ || document.querySelector('meta[content*="Navidrome"]'));
  }

  function observe() {
    scheduleScan(true);
    observer = new MutationObserver((mutations) => {
      // Ignore mutations caused by our own badge additions
      const isBadgeMutation = mutations.every((mutation) => {
        return Array.from(mutation.addedNodes).every((node) => {
          return (
            node.nodeType === 1 &&
            (node.classList?.contains("rym-ext-badge") || node.querySelector?.(".rym-ext-badge"))
          );
        });
      });

      if (isBadgeMutation) {
        log("Ignoring badge mutation");
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
    log("Running scan on:", window.location.hash);
    annotateAlbumTiles();
    annotateTrackRows();
    annotateAlbumBanner();
  }

  function annotateTrackRows() {
    // Handle both regular songs and playlist tracks
    // File 02 (album): tr[resource="song"] - only track ratings
    // File 04 (playlist): tr[resource="playlistTrack"] - only track ratings
    // File 05 (song list): tr[resource="song"] - only track ratings
    const rows = document.querySelectorAll('tr[resource="song"], tr[resource="playlistTrack"]');
    log(`Found ${rows.length} track rows`);

    rows.forEach((row, idx) => {
      // Remove existing badges
      row.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());

      const titleCell = row.querySelector(".column-title");
      const artistCell = row.querySelector(".column-artist");
      const albumCell = row.querySelector(".column-album");

      if (!titleCell) return;

      const title = titleCell.textContent?.trim() || "";
      const artist =
        artistCell?.querySelector("a")?.textContent?.trim() ||
        artistCell?.textContent?.trim() ||
        "";
      const album =
        albumCell?.querySelector("a")?.textContent?.trim() || albumCell?.textContent?.trim() || "";

      if (idx < 3) {
        // Log first 3 tracks
        log(`Track ${idx}:`, { title, artist, album });
      }

      // For track rows, we want to show track (song) ratings
      attachBadge(titleCell, artist, title, "song");
    });
  }

  function annotateAlbumTiles() {
    // Grid-based album cards on homepage (01) and artist page (03)
    const tiles = document.querySelectorAll("li.MuiGridListTile-root");
    log(`Found ${tiles.length} album tiles`);

    tiles.forEach((tile, idx) => {
      // Remove existing badges
      tile.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());

      // Get album title from image alt
      const albumImg = tile.querySelector("img[alt]");
      const title = (albumImg?.alt || albumImg?.getAttribute("alt") || "").trim();

      if (!title) {
        if (idx < 3) log(`Tile ${idx}: No title found`);
        return;
      }

      // Try to find artist info - may not be present in grid view
      const artistLink = tile.querySelector('a[href*="#/artist/"]');
      const artistText = tile.querySelector(".MuiGridListTileBar-title");
      const artist = (artistLink?.textContent || artistText?.textContent || "").trim();

      if (idx < 3) {
        // Log first 3 albums
        log(`Album ${idx}:`, { title, artist });
      }

      // Attach badge to the tile container (needs to have position relative for absolute positioning)
      const tileContainer = tile.querySelector(".MuiGridListTile-tile") || tile;

      // Ensure the container has position relative for absolute positioning
      if (tileContainer.style.position !== "absolute") {
        tileContainer.style.position = "relative";
      }

      attachBadge(tileContainer, artist, title, "release");
    });
  }

  function annotateAlbumBanner() {
    // Album page (file 02) - show album rating on the top banner
    // The title is in the header as "Navidrome  - [Album Title]"

    // Check if we're on an album page (view or edit mode)
    const hash = window.location.hash;
    const isAlbumPage =
      hash.includes("#/album/") && (hash.includes("/show") || /\/album\/[^\/]+$/.test(hash));

    if (!isAlbumPage) {
      return;
    }

    // Find the page title in the app bar
    const titleEl = document.querySelector('#react-admin-title, h6[id="react-admin-title"]');
    if (!titleEl) {
      return;
    }

    // Remove existing badges
    titleEl.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());

    // Extract album title from format "Navidrome  - [Album Title]"
    const fullText = titleEl.textContent?.trim() || "";
    const titleMatch = fullText.match(/Navidrome\s+-\s+(.+)/);
    const title = titleMatch ? titleMatch[1].trim() : "";

    if (!title) return;

    // Try to find artist from the first track row on the page
    const firstTrackRow = document.querySelector('tr[resource="song"]');
    const artistCell = firstTrackRow?.querySelector(".column-artist");
    const artist =
      artistCell?.querySelector("a")?.textContent?.trim() || artistCell?.textContent?.trim() || "";

    log("Album banner:", { title, artist });

    // Attach badge to the title element
    attachBadge(titleEl, artist, title, "release");
  }

  function attachBadge(target, artist, title, mediaType = "release") {
    if (!title || !title.trim()) {
      return;
    }

    const key = keyFor(artist, title);
    if (!key || !key.trim()) {
      return;
    }

    const match = cache.index[key];
    if (!match) {
      // Only log 5% of misses to avoid spam
      if (Math.random() < 0.05) {
        log(`No match for: "${artist}" - "${title}" (key: "${key}")`);
      }
      return;
    }

    // Check if this is the right type of media
    if (!isMatchable(match, mediaType)) {
      return;
    }

    // Don't add duplicate badges
    if (target.querySelector(".rym-ext-badge")) {
      return;
    }

    const badge = buildBadge(match);
    target.appendChild(badge);
    log(`✓ "${title}" → ${match.ratingValue}`);
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-navidrome";
    const rating = match.ratingValue || "?";
    link.textContent = `RYM ${rating}`;
    link.title = buildTooltip(match);

    // Apply gradient color based on rating (0-5 scale)
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
    // Programmatic gradient for 0-5 scale
    // AGGRESSIVE compression 0-3, VERY PROGRESSIVE 3-4, compressed 4-5
    // Each 0.1 difference in 3-4 range should be clearly visible

    // Clamp to 0-5
    const clampedRating = Math.max(0, Math.min(5, rating));

    // Non-linear mapping with extreme focus on 3-4 range
    let normalizedValue;

    if (clampedRating < 3.0) {
      // AGGRESSIVE compress: 0-3 maps to 0-0.1 (only 10% of gradient)
      normalizedValue = (clampedRating / 3.0) * 0.1;
    } else if (clampedRating < 4.0) {
      // VERY PROGRESSIVE expand: 3-4 maps to 0.1-0.8 (70% of gradient!)
      // Each 0.1 step = 7% of total gradient = ~12.6 degrees hue change
      normalizedValue = 0.1 + ((clampedRating - 3.0) / 1.0) * 0.7;
    } else {
      // Compress high range: 4-5 maps to 0.8-1.0 (20% of gradient)
      normalizedValue = 0.8 + ((clampedRating - 4.0) / 1.0) * 0.2;
    }

    // Map to hue: 0 (red) to 180 (cyan)
    // Red -> Orange -> Yellow -> Green -> Cyan
    const hue = normalizedValue * 180;

    // Adjust saturation and lightness for better contrast
    // Higher ratings get slightly darker and more saturated
    const saturation = 70 + normalizedValue * 15; // 70-85%
    const lightness = 52 - normalizedValue * 10; // 52-42%

    return {
      bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      fg: "#ffffff",
    };
  }

  function buildTooltip(match) {
    const bits = [];
    bits.push(`${match.artist} — ${match.name}`);
    if (match.ratingValue) {
      bits.push(`Rating: ${match.ratingValue}${match.maxRating ? "/" + match.maxRating : ""}`);
    }
    if (match.ratingCount) bits.push(`Ratings: ${match.ratingCount}`);
    if (match.reviewCount) bits.push(`Reviews: ${match.reviewCount}`);
    if (match.updatedAt) bits.push(`Cached: ${match.updatedAt}`);
    if (match.url) bits.push(`Source: ${match.url}`);
    return bits.join(" · ");
  }

  function isMatchable(match, preferredType = null) {
    const matchType = match.mediaType || "release";

    // If a preferred type is specified, check if it matches
    if (preferredType) {
      // 'release' matches both 'release' and 'album' in the cache
      if (preferredType === "release") {
        return matchType === "release" || matchType === "album";
      }
      // 'song' matches 'song' or 'track' in the cache
      if (preferredType === "song") {
        return matchType === "song" || matchType === "track";
      }
      return matchType === preferredType;
    }

    // Otherwise, check if it's any matchable type
    return MATCHABLE_TYPES.includes(matchType);
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
      .rym-ext-badge-navidrome {
        /* Background and color set dynamically based on rating */
      }
      /* Badge in grid tiles (album cards) - always visible */
      .MuiGridListTile-root .rym-ext-badge {
        position: absolute !important;
        top: 4px;
        right: 4px;
        margin: 0;
        font-size: 9px;
        padding: 3px 6px;
        z-index: 2;
        opacity: 1 !important;
        visibility: visible !important;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      }
      /* Badge in album banner/header */
      h5 .rym-ext-badge,
      h6 .rym-ext-badge {
        margin-left: 10px;
        font-size: 11px;
        padding: 3px 7px;
        vertical-align: baseline;
      }
      /* Badge in table cells */
      .MuiTableCell-root .rym-ext-badge {
        margin-left: 6px;
        font-size: 10px;
      }
    `;
    document.documentElement.appendChild(style);
  }
})();
