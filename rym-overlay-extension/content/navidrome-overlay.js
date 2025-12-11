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
    annotateTrackRows();
    annotateAlbumTiles();
  }

  function annotateTrackRows() {
    const rows = document.querySelectorAll('tr[resource="song"]');
    rows.forEach((row) => {
      row.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());
      const titleCell = row.querySelector(".column-title");
      const artistCell = row.querySelector(".column-artist");
      if (!titleCell) return;

      const title = titleCell.textContent || "";
      const artist =
        artistCell?.querySelector("a")?.textContent ||
        artistCell?.textContent ||
        "";

      attachBadge(titleCell, artist, title);
    });
  }

  function annotateAlbumTiles() {
    const tiles = document.querySelectorAll('.MuiGridListTile-root, .jss420');
    tiles.forEach((tile) => {
      tile.querySelectorAll(".rym-ext-badge").forEach((b) => b.remove());
      const titleEl =
        tile.querySelector('.jss419 p, a[href*="#/album/"] p') ||
        tile.querySelector('.MuiTypography-root.MuiTypography-body1');
      const artistEl =
        tile.querySelector('.jss417 a[href*="#/artist/"]') ||
        tile.querySelector('a[href*="#/artist/"]');

      const title = titleEl?.textContent || "";
      const artist = artistEl?.textContent || "";
      if (!titleEl) return;

      attachBadge(titleEl.parentElement || titleEl, artist, title);
    });
  }

  function attachBadge(target, artist, title) {
    const key = keyFor(artist, title);
    if (!key.trim()) return;
    const match = cache.index[key];
    if (!match || !isMatchable(match)) return;
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

  function isMatchable(match) {
    return MATCHABLE_TYPES.includes(match.mediaType || "release");
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
      }
      .rym-ext-badge-navidrome {
        /* Background and color set dynamically based on rating */
      }
    `;
    document.documentElement.appendChild(style);
  }
})();
