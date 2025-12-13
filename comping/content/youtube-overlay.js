(function () {
  let DEBUG = true;
  const log = (...args) => DEBUG && console.log("[rym-youtube]", ...args);
  const warn = (...args) => console.warn("[rym-youtube]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || ((artist, title) => `${artist}|${title}`);
  const alternativeKeys = api.alternativeKeys || ((artist, title) => [keyFor(artist, title)]);
  const stripVersionSuffix = api.stripVersionSuffix || ((text) => text);
  const MATCHABLE_TYPES = ["release", "album", "song", "track"];

  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;
  let scanScheduled = false;
  let scanTimer = null;
  let lastScanAt = 0;
  const SCAN_COOLDOWN_MS = 400;
  let needsFullScan = false;

  window.__RYM_YOUTUBE_DEBUG__ = {
    getCache: () => cache,
    rescan: () => runScan(),
    enableDebug: () => {
      DEBUG = true;
      log("Debug enabled");
    },
    disableDebug: () => {
      DEBUG = false;
      console.log("[rym-youtube] Debug disabled");
    },
    testLookup: (artist, title) => {
      const keys = alternativeKeys(artist, title);
      for (const key of keys) {
        if (cache?.index?.[key]) {
          log("Match for", key, cache.index[key]);
          return cache.index[key];
        }
      }
      warn("No match for keys", keys);
      return null;
    },
  };

  init().catch((err) => warn("init failed", err));

  async function init() {
    if (!isYouTube()) return;

    settings = await fetchSettings();
    if (!settings?.overlays?.youtube) {
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
      return { overlays: { youtube: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch {
      return null;
    }
  }

  function isYouTube() {
    const host = window.location.hostname;
    return host.includes("youtube.com") || host === "youtu.be";
  }

  function observe() {
    scheduleScan(true);
    setInterval(() => scheduleScan(), 3000);
    observer = new MutationObserver((mutations) => {
      const onlyOurBadges = mutations.every((mutation) => {
        if (mutation.removedNodes?.length) return false;
        return Array.from(mutation.addedNodes).every((node) => {
          return (
            node.nodeType === 1 &&
            (node.classList?.contains("rym-ext-badge-youtube") ||
              node.querySelector?.(".rym-ext-badge-youtube"))
          );
        });
      });
      if (onlyOurBadges) return;

      needsFullScan = true;
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scheduleScan(full = false) {
    if (full) needsFullScan = true;
    if (scanScheduled || scanTimer) return;
    scanScheduled = true;
    const now = Date.now();
    const wait = Math.max(0, SCAN_COOLDOWN_MS - (now - lastScanAt));
    scanTimer = setTimeout(() => {
      scanScheduled = false;
      scanTimer = null;
      lastScanAt = Date.now();
      if (needsFullScan) {
        needsFullScan = false;
        runScan();
      }
    }, wait);
  }

  function runScan() {
    annotateWatchTitle();
    annotateRenderers();
  }

  function annotateWatchTitle() {
    const wrapper = document.querySelector("ytd-watch-metadata");
    const titleEl = wrapper?.querySelector("#title yt-formatted-string");
    if (!titleEl) return;

    const channelEl =
      wrapper.querySelector("#owner ytd-channel-name #text") ||
      wrapper.querySelector("#owner ytd-channel-name a");

    const title = textContent(titleEl);
    const channel = textContent(channelEl);
    const meta = parseTitle(title, channel);
    if (!meta) return;

    attachBadge(titleEl, meta.artist, meta.title, meta.mediaType);
  }

  function annotateRenderers() {
    const selectors = [
      "ytd-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-rich-grid-media",
      "ytd-playlist-panel-video-renderer",
    ];
    document.querySelectorAll(selectors.join(",")).forEach((renderer, idx) => {
      const titleEl =
        renderer.querySelector("a#video-title") ||
        renderer.querySelector("yt-formatted-string#video-title") ||
        renderer.querySelector("#video-title");
      if (!titleEl) {
        if (idx < 2) log("Renderer missing title", renderer);
        return;
      }

      const channelEl =
        renderer.querySelector("#channel-name #text") ||
        renderer.querySelector("#channel-name a") ||
        renderer.querySelector("ytd-channel-name") ||
        renderer.querySelector(".inline-metadata-item");

      const title = textContent(titleEl);
      const channel = textContent(channelEl);
      const meta = parseTitle(title, channel);
      if (!meta) return;

      const keys = alternativeKeys(meta.artist, meta.title);
      const primaryKey = keys[0];
      if (primaryKey && titleEl.dataset.rymExtKey === primaryKey) {
        // Already annotated for this item.
        return;
      }
      titleEl.dataset.rymExtKey = primaryKey || "";

      attachBadge(titleEl, meta.artist, meta.title, meta.mediaType, keys);
    });
  }

  function parseTitle(rawTitle, channelName) {
    if (!rawTitle) return null;
    const titleText = collapseSpaces(rawTitle);
    const channel = collapseSpaces(stripChannelSuffix(channelName || ""));

    const delimiterMatch = titleText.split(/\s*[-–—]\s*/);
    let artist = "";
    let work = titleText;
    if (delimiterMatch.length >= 2 && delimiterMatch[0].length > 0) {
      artist = delimiterMatch.shift().trim();
      work = delimiterMatch.join(" - ").trim();
    } else if (channel) {
      artist = channel;
      work = titleText;
    }

    work = stripQualifiers(work);
    if (!artist) {
      artist = channel || "";
    }

    if (!artist || !work) return null;

    const albumHint = /(full album|album stream|complete album|full ep|full lp)/i.test(
      titleText.toLowerCase()
    );
    const mediaType = albumHint ? "release" : "song";

    return { artist, title: work, mediaType };
  }

  function stripQualifiers(text) {
    if (!text) return "";
    let next = text
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\([^)]+\)/g, "")
      .replace(/\{[^}]+\}/g, "");

    next = next.replace(
      /\b(official\s+(music\s+)?video|official\s+audio|lyrics?(?:\s+video)?|mv|visualizer|remaster(?:ed)?|hd|4k)\b/gi,
      ""
    );
    next = next.replace(/\b(full album|album stream|complete album|full ep|full lp)\b/gi, "");
    next = collapseSpaces(next);
    next = next.replace(/^[-–—•\s]+|[-–—•\s]+$/g, "");
    return stripVersionSuffix(next);
  }

  function stripChannelSuffix(name) {
    if (!name) return "";
    return name.replace(/\s+-\s+topic$/i, "").trim();
  }

  function attachBadge(target, artist, title, mediaType = "release", cachedKeys = null) {
    if (!target || !artist || !title) return;
    const keys = cachedKeys || alternativeKeys(artist, title);
    const existing = target.querySelector(".rym-ext-badge-youtube");
    if (existing?.dataset?.rymKey && keys.includes(existing.dataset.rymKey)) {
      // Badge is already present; refresh text/tooltip in case the rating changed.
      updateBadge(existing, cache.index[existing.dataset.rymKey]);
      return;
    }
    if (existing) existing.remove();

    const match = keys.map((key) => cache.index?.[key]).find(Boolean);
    if (!match) {
      return;
    }

    if (!isMatchable(match, mediaType)) {
      return;
    }

    const badge = buildBadge(match, keys[0]);
    target.appendChild(badge);
    log(`✓ badge: "${artist}" - "${title}" → ${match.ratingValue}`);
  }

  function isMatchable(match, preferredType = null) {
    const matchType = (match.mediaType || "").toLowerCase();
    if (preferredType) {
      if (preferredType === "release") return matchType === "release" || matchType === "album";
      if (preferredType === "song")
        return matchType === "song" || matchType === "track" || matchType === "single";
      return matchType === preferredType;
    }
    return MATCHABLE_TYPES.includes(matchType);
  }

  function buildBadge(match, key) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-youtube";
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
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .rym-ext-badge {
        margin-left: 8px;
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
      .rym-ext-badge-youtube {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      }
      h1 .rym-ext-badge-youtube {
        font-size: 12px;
        padding: 4px 8px;
      }
      a#video-title .rym-ext-badge-youtube,
      yt-formatted-string#video-title .rym-ext-badge-youtube {
        font-size: 10px;
        padding: 2px 6px;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function textContent(node) {
    return node?.textContent ? collapseSpaces(node.textContent) : "";
  }

  function collapseSpaces(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }
})();
