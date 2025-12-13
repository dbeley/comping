(function () {
  let DEBUG = true; // Set to false to reduce console noise
  const log = (...args) => DEBUG && console.log("[rym-spotify]", ...args);
  const warn = (...args) => console.warn("[rym-spotify]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");

  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let needsFullScan = false;

  // Expose debug helpers for manual testing
  window.__RYM_SPOTIFY_DEBUG__ = {
    rescan: () => runScan(),
    getCache: () => cache,
    getCacheStats: () => summarizeCache(cache),
    enableDebug: () => {
      DEBUG = true;
      log("Debug enabled");
    },
    disableDebug: () => {
      DEBUG = false;
      console.log("[rym-spotify] Debug disabled");
    },
  };

  init().catch((err) => warn("init failed", err));

  async function init() {
    log("Initializing...");
    if (!isSpotify()) {
      log("Not a Spotify page");
      return;
    }
    log("Spotify detected");

    settings = await fetchSettings();
    if (!settings.overlays?.spotify) {
      log("Spotify overlay disabled in settings");
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
      return { overlays: { spotify: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch {
      return null;
    }
  }

  function isSpotify() {
    return /open\.spotify\.com/.test(window.location.hostname);
  }

  function observe() {
    scheduleScan(true);
    observer = new MutationObserver((mutations) => {
      const isBadgeMutation = mutations.every((mutation) => {
        return Array.from(mutation.addedNodes).every((node) => {
          return (
            node.nodeType === 1 &&
            (node.classList?.contains("rym-ext-badge-spotify") ||
              node.querySelector?.(".rym-ext-badge-spotify"))
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
        Promise.resolve(runScan()).catch((err) => warn("scan failed", err));
      }
    });
  }

  async function runScan() {
    const pageType = detectPageType();
    log("Page type detected:", pageType);

    if (pageType === "artist") {
      await annotateArtistPage();
    } else if (pageType === "album") {
      await annotateAlbumPage();
    } else if (pageType === "playlist") {
      await annotatePlaylistPage();
    }
  }

  function detectPageType() {
    if (document.querySelector('[data-testid="artist-page"]')) {
      return "artist";
    }
    if (document.querySelector('[data-testid="album-page"]')) {
      return "album";
    }
    if (document.querySelector('[data-testid="playlist-page"]')) {
      return "playlist";
    }
    return "unknown";
  }

  async function annotateArtistPage() {
    // Get artist name from the title
    const artistName = extractArtistName();
    if (!artistName) {
      log("Could not extract artist name");
      return;
    }
    log("Artist name:", artistName);

    // Annotate album cards in discography section
    await annotateAlbumCards(artistName);

    // Annotate tracks in top tracks section
    await annotateTrackRows(artistName);
  }

  async function annotateAlbumPage() {
    const albumInfo = extractAlbumInfo();
    if (!albumInfo.title || !albumInfo.artist) {
      log("Could not extract album info");
      return;
    }
    log("Album info:", albumInfo);

    // Annotate the album header
    await annotateAlbumHeader(albumInfo);

    // Annotate individual tracks
    await annotateTrackRows(albumInfo.artist);
  }

  async function annotatePlaylistPage() {
    // Annotate track rows in playlist
    await annotateTrackRows();
  }

  async function annotateAlbumCards(artistFilter = null) {
    const cards = document.querySelectorAll('[data-testid="card-image"]');
    let idx = 0;

    for (const card of cards) {
      const logIndex = idx;
      idx += 1;

      // Find parent card container
      const cardContainer = card.closest(
        '[data-testid="component-shelf"] > div > div, .grid-container > div'
      );
      if (!cardContainer) continue;

      // Remove existing badges
      cardContainer.querySelectorAll(".rym-ext-badge-spotify").forEach((b) => b.remove());

      const albumLink = cardContainer.querySelector('a[href*="/album/"]');
      if (!albumLink) continue;

      const albumTitle = extractTextFromElement(cardContainer);
      if (!albumTitle) {
        if (logIndex < 3) log("No title found for album card", cardContainer);
        continue;
      }

      const artist = artistFilter || extractArtistFromCard(cardContainer);
      const match = await findMatch({ artist, title: albumTitle, type: "release" });

      if (!match) {
        if (logIndex < 3) log(`No match for album "${albumTitle}" by ${artist}`);
        continue;
      }

      const badge = buildBadge(match);
      const imageContainer = card.parentElement;
      if (imageContainer) {
        imageContainer.style.position = "relative";
        imageContainer.appendChild(badge);
        if (logIndex < 3) {
          log(`✓ BADGE ATTACHED: "${albumTitle}" → ${match.ratingValue || "?"}`);
        }
      }
    }
  }

  async function annotateTrackRows(artistFilter = null) {
    const rows = document.querySelectorAll(
      '[data-testid="tracklist-row"], [data-testid="playlist-tracklist-row"]'
    );
    let idx = 0;

    for (const row of rows) {
      const logIndex = idx;
      idx += 1;

      // Remove existing badges
      row.querySelectorAll(".rym-ext-badge-spotify").forEach((b) => b.remove());

      const trackInfo = extractTrackInfo(row);
      if (!trackInfo.title) {
        if (logIndex < 3) log("No track title found in row", row);
        continue;
      }

      const artist = artistFilter || trackInfo.artist;
      if (!artist) {
        if (logIndex < 3) log("No artist found for track", trackInfo.title);
        continue;
      }

      const match = await findMatch({ artist, title: trackInfo.title, type: "song" });

      if (!match) {
        if (logIndex < 3) log(`No match for track "${trackInfo.title}" by ${artist}`);
        continue;
      }

      const badge = buildBadge(match, true);
      const titleCell = row.querySelector(
        '[data-testid="tracklist-row"] > div:first-child, .trackListRowGrid > div:first-child'
      );
      if (titleCell) {
        titleCell.style.position = "relative";
        titleCell.appendChild(badge);
        if (logIndex < 3) {
          log(`✓ BADGE ATTACHED: "${trackInfo.title}" → ${match.ratingValue || "?"}`);
        }
      }
    }
  }

  async function annotateAlbumHeader(albumInfo) {
    const header = document.querySelector(
      '[data-testid="entity-title"], [data-testid="entityTitle"]'
    );
    if (!header) {
      log("Album header not found");
      return;
    }

    // Remove existing badges
    header.querySelectorAll(".rym-ext-badge-spotify").forEach((b) => b.remove());

    const match = await findMatch({
      artist: albumInfo.artist,
      title: albumInfo.title,
      type: "release",
      year: albumInfo.year,
    });

    if (!match) {
      log(`No match for album "${albumInfo.title}" by ${albumInfo.artist}`);
      return;
    }

    const badge = buildBadge(match);
    badge.style.position = "relative";
    badge.style.display = "inline-block";
    badge.style.marginLeft = "12px";
    badge.style.verticalAlign = "middle";

    header.appendChild(badge);
    log(`✓ BADGE ATTACHED to album header: "${albumInfo.title}" → ${match.ratingValue || "?"}`);
  }

  function extractArtistName() {
    // Try from page title first
    const titleMatch = document.title.match(/^(.+?)\s*-\s*Spotify$/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

    // Try from artist title element
    const titleElement = document.querySelector(
      '[data-testid="adaptiveEntityTitle"], [data-testid="entity-title"]'
    );
    if (titleElement) {
      return text(titleElement);
    }

    return null;
  }

  function extractAlbumInfo() {
    const info = { title: null, artist: null, year: null };

    // Get title
    const titleElement = document.querySelector('[data-testid="entityTitle"]');
    if (titleElement) {
      info.title = text(titleElement);
    }

    // Get artist from creator link
    const artistLink = document.querySelector('[data-testid="creator-link"]');
    if (artistLink) {
      info.artist = text(artistLink);
    }

    // Try to extract year from release date text
    const releaseText = document.body.textContent;
    const yearMatch = releaseText.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      info.year = yearMatch[1];
    }

    return info;
  }

  function extractTrackInfo(row) {
    const info = { title: null, artist: null };

    // Track title is usually in the first column
    const titleElement = row.querySelector('[dir="auto"]');
    if (titleElement) {
      info.title = text(titleElement);
    }

    // Artist link for tracks with multiple artists
    const artistLink = row.querySelector('a[href*="/artist/"]');
    if (artistLink) {
      info.artist = text(artistLink);
    }

    return info;
  }

  function extractTextFromElement(element) {
    // Try to find link with title
    const link = element.querySelector('a[href*="/album/"], a[href*="/track/"]');
    if (link) {
      const title = link.getAttribute("aria-label") || text(link);
      if (title) return title;
    }

    // Fallback to any text
    return text(element);
  }

  function extractArtistFromCard(card) {
    // Look for artist link
    const artistLink = card.querySelector('a[href*="/artist/"]');
    if (artistLink) {
      return text(artistLink);
    }

    // Fallback: try to extract from subtitle
    const subtitle = card.querySelector('[data-encore-id="listRowSubtitle"], .secondary-text');
    if (subtitle) {
      return text(subtitle);
    }

    return null;
  }

  async function findMatch(info) {
    if (!cache?.index) return null;

    const artist = info.artist || "";
    const title = info.title || "";
    const type = info.type || "release";

    if (!title) return null;

    const key = keyFor(artist, title);
    const match = cache.index[key];

    if (match && isTypeMatch(match, type, info.year)) {
      return match;
    }

    return null;
  }

  function isTypeMatch(match, expectedType, yearHint) {
    const matchType = (match.mediaType || "").toLowerCase();

    // Type matching
    if (expectedType === "release" && !["release", "album"].includes(matchType)) {
      return false;
    }
    if (expectedType === "song" && matchType !== "song") {
      return false;
    }

    // Year matching (if provided)
    if (yearHint && match.releaseDate) {
      if (!match.releaseDate.includes(yearHint)) {
        return false;
      }
    }

    return true;
  }

  function buildBadge(match, compact = false) {
    const el = document.createElement(match.url ? "a" : "span");
    el.className = "rym-ext-badge rym-ext-badge-spotify";
    if (compact) {
      el.classList.add("rym-ext-badge-compact");
    }

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
    const artist = match.artist || "";
    bits.push(artist ? `${title} — ${artist}` : title);
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
      .rym-ext-badge {
        font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .rym-ext-badge-spotify {
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
      .rym-ext-badge-spotify:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      }
      .rym-ext-badge-spotify.rym-ext-badge-compact {
        position: static;
        display: inline-block;
        margin-left: 8px;
        font-size: 10px;
        padding: 2px 6px;
        vertical-align: middle;
      }
    `;
    document.head.appendChild(style);
  }

  function text(node) {
    if (!node) return "";
    return (node.textContent || "").replace(/\s+/g, " ").trim();
  }
})();
