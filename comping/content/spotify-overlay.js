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
  const text = api.text;
  const ColorSchemes = api.ColorSchemes;

  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanner = null;

  const debug = createDebugger("rym-spotify", {
    rescan: () => runScan(),
    getCache: () => cache,
    getCacheStats: () => getCacheStats(cache),
  });
  const log = debug.log;
  const warn = debug.warn;

  window.__RYM_SPOTIFY_DEBUG__ = debug;

  init().catch((err) => warn("init failed", err));

  async function init() {
    log("Initializing...");
    if (!isSpotify()) {
      log("Not a Spotify page");
      return;
    }
    log("Spotify detected");

    settings = await fetchSettings({ overlays: { spotify: true } });
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

  function isSpotify() {
    return /open\.spotify\.com/.test(window.location.hostname);
  }

  function observe() {
    scanner = createScanScheduler(runScan);
    scanner.schedule(true);

    observer = createBadgeAwareMutationObserver("rym-ext-badge-spotify", () => {
      scanner.schedule(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
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
    const artistName = extractArtistName();
    if (!artistName) {
      log("Could not extract artist name");
      return;
    }
    log("Artist name:", artistName);

    await annotateAlbumCards(artistName);
    await annotateTrackRows(artistName);
  }

  async function annotateAlbumPage() {
    const albumInfo = extractAlbumInfo();
    if (!albumInfo.title || !albumInfo.artist) {
      log("Could not extract album info");
      return;
    }
    log("Album info:", albumInfo);

    await annotateAlbumHeader(albumInfo);
    await annotateTrackRows(albumInfo.artist);
  }

  async function annotatePlaylistPage() {
    await annotateTrackRows();
  }

  async function annotateAlbumCards(artistFilter = null) {
    const cards = document.querySelectorAll('[data-testid="card-image"]');
    let idx = 0;

    for (const card of cards) {
      const logIndex = idx;
      idx += 1;

      const cardContainer = card.closest(
        '[data-testid="component-shelf"] > div > div, .grid-container > div'
      );
      if (!cardContainer) continue;

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

      const badge = buildBadge(match, {
        className: "rym-ext-badge rym-ext-badge-spotify",
        prefix: "RYM",
        colorScheme: ColorSchemes.LINEAR,
        includeTitle: true,
      });

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

      const badge = buildBadge(match, {
        className: "rym-ext-badge rym-ext-badge-spotify rym-ext-badge-compact",
        prefix: "RYM",
        compact: true,
        colorScheme: ColorSchemes.LINEAR,
        includeTitle: true,
      });

      const titleElement = row.querySelector('[dir="auto"]');
      if (titleElement) {
        titleElement.insertBefore(badge, titleElement.firstChild);
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

    const badge = buildBadge(match, {
      className: "rym-ext-badge rym-ext-badge-spotify",
      prefix: "RYM",
      colorScheme: ColorSchemes.LINEAR,
      includeTitle: true,
    });

    badge.style.position = "relative";
    badge.style.display = "inline-block";
    badge.style.marginLeft = "12px";
    badge.style.verticalAlign = "middle";

    header.appendChild(badge);
    log(`✓ BADGE ATTACHED to album header: "${albumInfo.title}" → ${match.ratingValue || "?"}`);
  }

  function extractArtistName() {
    const titleMatch = document.title.match(/^(.+?)\s*-\s*Spotify$/);
    if (titleMatch) {
      return titleMatch[1].trim();
    }

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

    const titleElement = document.querySelector('[data-testid="entityTitle"]');
    if (titleElement) {
      info.title = text(titleElement);
    }

    const artistLink = document.querySelector('[data-testid="creator-link"]');
    if (artistLink) {
      info.artist = text(artistLink);
    }

    const releaseText = document.body.textContent;
    const yearMatch = releaseText.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearMatch) {
      info.year = yearMatch[1];
    }

    return info;
  }

  function extractTrackInfo(row) {
    const info = { title: null, artist: null };

    const titleElement = row.querySelector('[dir="auto"]');
    if (titleElement) {
      info.title = text(titleElement);
    }

    const artistLink = row.querySelector('a[href*="/artist/"]');
    if (artistLink) {
      info.artist = text(artistLink);
    }

    return info;
  }

  function extractTextFromElement(element) {
    const link = element.querySelector('a[href*="/album/"], a[href*="/track/"]');
    if (link) {
      const title = link.getAttribute("aria-label") || text(link);
      if (title) return title;
    }

    return text(element);
  }

  function extractArtistFromCard(card) {
    const artistLink = card.querySelector('a[href*="/artist/"]');
    if (artistLink) {
      return text(artistLink);
    }

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

    if (match && isMatchable(match, type)) {
      if (info.year && match.releaseDate && !match.releaseDate.includes(info.year)) {
        return null;
      }
      return match;
    }

    return null;
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
        color: #fff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
        z-index: 12;
        text-decoration: none;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }
      .rym-ext-badge-spotify:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.6);
      }
      .rym-ext-badge-spotify.rym-ext-badge-compact {
        position: static;
        display: inline-block;
        margin-right: 6px;
        margin-left: 0;
        font-size: 10px;
        padding: 2px 6px;
        vertical-align: middle;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
    `;
    document.head.appendChild(style);
  }
})();
