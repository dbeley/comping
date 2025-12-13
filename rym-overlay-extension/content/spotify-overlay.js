(function () {
  let DEBUG = false;
  const log = (...args) => DEBUG && console.log("[rym-spotify]", ...args);
  const warn = (...args) => console.warn("[rym-spotify]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || ((artist, title) => `${artist}|${title}`);
  const alternativeKeys = api.alternativeKeys || ((artist, title) => [keyFor(artist, title)]);

  const MATCHES = {
    track: /\/track\//,
    album: /\/album\//,
  };

  let cache = null;
  let settings = null;
  let observer = null;
  let scanTimer = null;
  let lastScanAt = 0;
  const SCAN_COOLDOWN_MS = 400;

  window.__RYM_SPOTIFY_DEBUG__ = {
    getCache: () => cache,
    rescan: () => scheduleScan(true),
    enableDebug: () => {
      DEBUG = true;
      log("Debug enabled");
    },
    disableDebug: () => {
      DEBUG = false;
      log("Debug disabled");
    },
  };

  init().catch((err) => warn("init failed", err));

  async function init() {
    if (!isSpotify()) return;

    settings = await fetchSettings();
    if (!settings?.overlays?.spotify) {
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
    scheduleScan(true);
    log("Ready - cache entries:", Object.keys(cache.index).length);
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
    const host = window.location.hostname;
    return host.includes("open.spotify.com");
  }

  function observe() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(() => scheduleScan(), 1500);
  }

  function scheduleScan(force = false) {
    const now = Date.now();
    if (!force && now - lastScanAt < SCAN_COOLDOWN_MS) return;
    if (scanTimer) return;
    scanTimer = setTimeout(
      () => {
        scanTimer = null;
        lastScanAt = Date.now();
        annotateAnchors();
      },
      force ? 0 : SCAN_COOLDOWN_MS
    );
  }

  function annotateAnchors() {
    const anchors = document.querySelectorAll("a[href*='open.spotify.com/']");
    anchors.forEach((anchor) => {
      const href = anchor.href || anchor.getAttribute("href") || "";
      if (!href) return;

      let mediaType = null;
      if (MATCHES.track.test(href)) mediaType = "song";
      else if (MATCHES.album.test(href)) mediaType = "release";
      else return;

      const { title, artist } = extractMeta(anchor, mediaType);
      if (!title || !artist) return;

      attachBadge(anchor, artist, title, mediaType);
    });
  }

  function extractMeta(anchor, mediaType) {
    const title = collapse(text(anchor));
    let artist = "";

    const aria =
      anchor.getAttribute("aria-label") || anchor.parentElement?.getAttribute?.("aria-label");
    if (aria) {
      const parts = aria.split("·").map((s) => s.trim());
      const byMatch = aria.match(/by\s+(.+?)(?:$|,)/i);
      if (byMatch) {
        artist = collapse(byMatch[1]);
      } else if (parts.length >= 2) {
        artist = collapse(parts[parts.length - 1]);
      }
    }

    if (!artist) {
      const container =
        anchor.closest("[data-testid='tracklist-row']") ||
        anchor.closest("div[role='row']") ||
        anchor.parentElement;
      const artistLink = container?.querySelector("a[href*='/artist/']");
      artist = collapse(text(artistLink));
    }

    if (!artist && mediaType === "song") {
      // Some search result rows have the artist in a sibling span
      const siblingArtist = anchor.parentElement?.querySelector("span[dir='auto']");
      artist = collapse(text(siblingArtist));
    }

    return { title, artist };
  }

  function attachBadge(target, artist, title, mediaType = "release") {
    if (!target || !artist || !title) return;
    const keys = alternativeKeys(artist, title);
    const existing = target.querySelector(".rym-ext-badge-spotify");
    if (existing?.dataset?.rymKey && keys.includes(existing.dataset.rymKey)) {
      updateBadge(existing, cache.index[existing.dataset.rymKey]);
      return;
    }
    if (existing) existing.remove();

    const match = keys.map((key) => cache.index?.[key]).find(Boolean);
    if (!match) return;
    if (!isMatchable(match, mediaType)) return;

    const badge = buildBadge(match, keys[0]);
    target.appendChild(badge);
    log(`✓ badge: "${artist}" - "${title}" → ${match.ratingValue}`);
  }

  function isMatchable(match, preferredType = null) {
    const matchType = (match.mediaType || "").toLowerCase();
    if (preferredType === "release") return matchType === "release" || matchType === "album";
    if (preferredType === "song") return matchType === "song" || matchType === "track";
    return true;
  }

  function buildBadge(match, key) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-spotify";
    link.dataset.rymKey = key || "";
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

  function updateBadge(el, match) {
    if (!el || !match) return;
    const rating = match.ratingValue || "?";
    const nextText = `RYM ${rating}`;
    if (el.textContent !== nextText) el.textContent = nextText;
    el.title = buildTooltip(match);

    const ratingNum = parseFloat(rating);
    if (!isNaN(ratingNum)) {
      const color = getRatingColor(ratingNum);
      el.style.background = color.bg;
      el.style.color = color.fg;
    }
  }

  function buildTooltip(match) {
    const bits = [];
    if (match.artist) bits.push(`Artist: ${match.artist}`);
    if (match.name) bits.push(`Title: ${match.name}`);
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
    if (document.getElementById("rym-ext-spotify-styles")) return;
    const style = document.createElement("style");
    style.id = "rym-ext-spotify-styles";
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
        line-height: 1.2;
      }
      .rym-ext-badge-spotify {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function text(node) {
    return node?.textContent || "";
  }

  function collapse(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }
})();
