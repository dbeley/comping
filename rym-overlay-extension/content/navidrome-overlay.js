(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const MATCHABLE_TYPES = ["release", "song"];
  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  init().catch((err) => console.warn("[rym-overlay] navidrome init failed", err));

  async function init() {
    if (!isNavidrome()) return;
    settings = await fetchSettings();
    if (!settings.overlays?.navidrome) return;
    cache = await fetchCache();
    if (!cache || !cache.index) return;
    injectStyles();
    observe();
  }

  async function fetchSettings() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-settings-get" });
    } catch (_) {
      return { overlays: { navidrome: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch (_) {
      return null;
    }
  }

  function isNavidrome() {
    return Boolean(window.__APP_CONFIG__ || document.querySelector('meta[content*="Navidrome"]'));
  }

  function observe() {
    scheduleScan(true);
    observer = new MutationObserver(() => {
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
    rows.forEach((row) => {
      // Remove existing badges
      row.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());

      const titleCell = row.querySelector(".column-title");
      const artistCell = row.querySelector(".column-artist");
      const albumCell = row.querySelector(".column-album");

      if (!titleCell) return;

      const title = titleCell.textContent?.trim() || "";
      const artist = artistCell?.querySelector("a")?.textContent?.trim() ||
                     artistCell?.textContent?.trim() || "";
      const album = albumCell?.querySelector("a")?.textContent?.trim() ||
                    albumCell?.textContent?.trim() || "";

      // For track rows, we want to show track (song) ratings
      attachBadge(titleCell, artist, title, 'song');
    });
  }

  function annotateAlbumTiles() {
    // Grid-based album cards on homepage (01) and artist page (03)
    const tiles = document.querySelectorAll('li.MuiGridListTile-root');
    tiles.forEach((tile) => {
      // Remove existing badges
      tile.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());

      // Find album link and image
      const albumLink = tile.querySelector('a[href*="#/album/"]');
      const albumImg = tile.querySelector('img[alt]');

      if (!albumImg || !albumLink) return;

      // Album title is in the img alt attribute
      const title = albumImg.alt || "";

      // Try to find artist info - may not always be present in grid view
      const artistLink = tile.querySelector('a[href*="#/artist/"]');
      const artist = artistLink?.textContent || "";

      // Find the tile bar to attach the badge
      const tileBar = tile.querySelector('.MuiGridListTileBar-root, .MuiGridListTileBar-titleWrap');
      const target = tileBar || tile.querySelector('.MuiGridListTile-tile');

      if (!target) return;

      attachBadge(target, artist, title, 'release');
    });
  }

  function annotateAlbumBanner() {
    // Album page (file 02) - show album rating on the top banner
    // Look for the album detail page structure
    // The banner/header typically contains the album title and artist info

    // Check if we're on an album page
    const isAlbumPage = window.location.hash.includes('#/album/');
    if (!isAlbumPage) return;

    // Look for album header/banner - typically has album title and metadata
    // Try multiple selectors to find the album header
    const albumHeader = document.querySelector('[class*="AlbumDetails"], [class*="albumShow"], .show-tab');
    if (!albumHeader) return;

    // Remove existing badges in header
    albumHeader.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());

    // Find album title - usually in an h5 or h6 typography element
    const titleEl = albumHeader.querySelector('h5, h6, [class*="MuiTypography-h5"], [class*="MuiTypography-h6"]');
    if (!titleEl) return;

    const title = titleEl.textContent?.trim() || "";

    // Find artist link in the header
    const artistLink = albumHeader.querySelector('a[href*="#/artist/"]');
    const artist = artistLink?.textContent?.trim() || "";

    if (!title) return;

    // Attach badge next to the album title
    attachBadge(titleEl, artist, title, 'release');
  }

  function attachBadge(target, artist, title, mediaType = 'release') {
    const key = keyFor(artist, title);
    if (!key.trim()) return;
    const match = cache.index[key];
    if (!match || !isMatchable(match, mediaType)) return;
    if (target.querySelector(".rym-ext-badge")) return;

    const badge = buildBadge(match);
    target.appendChild(badge);
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
    // Clamp rating to 0-5 range
    const clamped = Math.max(0, Math.min(5, rating));
    // Map 0-5 to hue 0 (red) to 120 (green)
    const hue = (clamped / 5) * 120;
    // Use HSL: full saturation, medium lightness for vibrant colors
    return {
      bg: `hsl(${hue}, 85%, 50%)`,
      fg: "#ffffff"
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
      if (preferredType === 'release') {
        return matchType === 'release' || matchType === 'album';
      }
      // 'song' matches 'song' or 'track' in the cache
      if (preferredType === 'song') {
        return matchType === 'song' || matchType === 'track';
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
      /* Badge in grid tiles (album cards) */
      .MuiGridListTile-root .rym-ext-badge {
        margin: 4px;
        font-size: 9px;
        padding: 2px 5px;
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
