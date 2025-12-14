(function () {
  // Cross-browser compatibility: Firefox uses 'browser', Chrome uses 'chrome'
  const browser = globalThis.browser || globalThis.chrome;

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const createDebugger = api.createDebugger;
  const sendMessage = api.sendMessage || ((msg) => browser.runtime.sendMessage(msg));
  const MATCHABLE_TYPES = ["release", "song"];

  let cache = null;
  let typeIndex = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  const debug = createDebugger("rym-navidrome", {
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
      debug.log(`Test lookup - Key: "${key}"`);
      const match = cache?.index[key];
      if (match) {
        debug.log("Match found:", match);
        return match;
      } else {
        debug.log("No match found");
        debug.log("Sample cache keys:", Object.keys(cache?.index || {}).slice(0, 10));
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
      debug.log(`Found ${results.length} matches for "${searchTerm}"`);
      return results;
    },
    rescan: () => runScan(),
  });
  const log = debug.log;
  const warn = debug.warn;

  // Expose debug helpers to window for manual testing
  window.__RYM_NAVIDROME_DEBUG__ = debug;

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

    typeIndex = buildTypeIndex(cache.entries || []);
    log("Type index built keys:", typeIndex ? Object.keys(typeIndex).length : 0);

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
      return await sendMessage({ type: "rym-settings-get" });
    } catch {
      return { overlays: { navidrome: true } };
    }
  }

  async function fetchCache() {
    try {
      return await sendMessage({ type: "rym-cache-request" });
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

  function getArtistFromPage() {
    // Try multiple methods to extract artist name from page context

    // Method 1: From first track row on the page
    const firstTrackRow = document.querySelector('tr[resource="song"]');
    if (firstTrackRow) {
      const artistCell = firstTrackRow.querySelector(".column-artist");
      const artist =
        artistCell?.querySelector("a")?.textContent?.trim() ||
        artistCell?.textContent?.trim() ||
        "";
      if (artist) return artist;
    }

    // Method 2: From page title (if it contains " - ")
    const titleEl = document.querySelector('#react-admin-title, h6[id="react-admin-title"]');
    if (titleEl) {
      const fullText = titleEl.textContent?.trim() || "";
      // Format: "Navidrome  - [Artist Name]"
      const titleMatch = fullText.match(/Navidrome\s+-\s+(.+)/);
      if (titleMatch) {
        const extractedText = titleMatch[1].trim();
        // Remove common suffixes that aren't the artist name
        const cleanedArtist = extractedText
          .replace(/\s+-\s+Albums$/, "")
          .replace(/\s+Albums$/, "")
          .trim();
        if (cleanedArtist) return cleanedArtist;
      }
    }

    // Method 3: From biography or artist info section
    const bioSection = document.querySelector(".MuiTypography-root.MuiTypography-body1");
    if (bioSection) {
      const bioText = bioSection.textContent?.trim() || "";
      // Try to extract artist name from first sentence if it's structured like "ARTIST is a..."
      const bioMatch = bioText.match(/^([^,\.]+)\s+(is|are|was|were)\s+/);
      if (bioMatch) {
        return bioMatch[1].trim();
      }
    }

    return "";
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
    const hash = window.location.hash;
    const isArtistPage = hash.includes("#/artist/");
    log(`Found ${tiles.length} album tiles (page: ${hash}, isArtistPage: ${isArtistPage})`);

    // On artist pages, extract the artist name from page context
    let pageArtist = "";
    if (isArtistPage) {
      pageArtist = getArtistFromPage();
      log(`Extracted artist from page: "${pageArtist}"`);
    }

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
      let artist = (artistLink?.textContent || artistText?.textContent || "").trim();

      // On artist pages, use the artist from page context if not found in tile
      if (isArtistPage && !artist) {
        artist = pageArtist;
      }

      // Attach badge to the tile container (needs to have position relative for absolute positioning)
      const tileContainer = tile.querySelector(".MuiGridListTile-tile") || tile;

      // Ensure the container has position relative for absolute positioning
      const currentPosition = window.getComputedStyle(tileContainer).position;
      if (currentPosition !== "relative" && currentPosition !== "absolute") {
        tileContainer.style.position = "relative";
      }

      if (idx < 3 || isArtistPage) {
        // Log first 3 albums, or all albums on artist page
        log(
          `Album ${idx} (artist page: ${isArtistPage}):`,
          { title, artist },
          "container:",
          tileContainer.className,
          `position: ${currentPosition}`
        );
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

    const { key, match, mismatchType } = findMatch(artist, title, mediaType);
    if (!key || !key.trim()) {
      return;
    }

    if (!match) {
      // Only log 5% of misses to avoid spam
      if (Math.random() < 0.05) {
        log(`No match for: "${artist}" - "${title}" (key: "${key}")`);
      }
      return;
    }

    if (mismatchType) {
      log(
        `✗ Type mismatch: "${title}" is ${mismatchType}, expected ${mediaType} (checked alternates)`
      );
      return;
    }

    // Don't add duplicate badges
    if (target.querySelector(".rym-ext-badge")) {
      return;
    }

    const badge = buildBadge(match);
    target.appendChild(badge);
    log(`✓ BADGE ATTACHED: "${title}" → ${match.ratingValue} (target: ${target.className})`);
  }

  function findMatch(artist, title, preferredType) {
    const key = keyFor(artist, title);
    if (!key || !key.trim()) return { key, match: null };

    const direct = cache.index[key];
    if (direct && isMatchable(direct, preferredType)) {
      return { key, match: direct };
    }

    const fallback = findByType(key, preferredType);
    if (fallback) {
      if (direct) {
        log(
          `Resolved mismatch for "${title}": index has ${direct.mediaType}, using ${fallback.mediaType}`
        );
      }
      return { key, match: fallback };
    }

    return { key, match: null, mismatchType: direct?.mediaType };
  }

  function findByType(key, preferredType) {
    if (!typeIndex || !preferredType) return null;
    const bucket = typeIndex[key];
    if (!bucket) return null;
    const preferredTypes = getPreferredTypes(preferredType);
    for (const type of preferredTypes) {
      if (bucket[type]) return bucket[type];
    }
    return null;
  }

  function buildTypeIndex(entries) {
    const map = {};
    for (const entry of entries) {
      const key = keyFor(entry.artist || "", entry.name || "");
      if (!key) continue;
      const mediaType = entry.mediaType || "release";
      map[key] = map[key] || {};
      const existing = map[key][mediaType];
      if (existing && !existing.isPartial && entry.isPartial) continue;
      map[key][mediaType] = entry;
    }
    return map;
  }

  function getPreferredTypes(preferredType) {
    if (preferredType === "release") return ["release", "album"];
    if (preferredType === "song") return ["song", "track"];
    return [preferredType];
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
      .MuiGridListTile-root .MuiGridListTile-tile .rym-ext-badge,
      .MuiGridListTile-tile > .rym-ext-badge {
        position: absolute !important;
        top: 4px;
        right: 4px;
        margin: 0;
        font-size: 9px;
        padding: 3px 6px;
        z-index: 10;
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
