(function () {
  const api = window.__RYM_EXT__ || {};
  const alternativeKeys = api.alternativeKeys || ((artist, title) => [api.keyFor(artist, title)]);
  const stripVersionSuffix = api.stripVersionSuffix || ((text) => text);
  const buildBadge = api.buildBadge;
  const updateBadge = api.updateBadge;
  const isMatchable = api.isMatchable;
  const ColorSchemes = api.ColorSchemes;
  const createOverlay = api.createOverlay;

  function isYouTube() {
    const host = window.location.hostname;
    return host.includes("youtube.com") || host === "youtu.be";
  }

  function getStyles() {
    return `
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
  }

  function runScan(cache, settings, debug) {
    annotateWatchTitle(cache, debug);
    annotateRenderers(cache, debug);
  }

  function annotateWatchTitle(cache, debug) {
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

    attachBadge(titleEl, meta.artist, meta.title, meta.mediaType, null, cache, debug);
  }

  function annotateRenderers(cache, debug) {
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
        if (idx < 2) debug.log("Renderer missing title", renderer);
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

      // Skip if already processed with the same key and badge exists
      if (primaryKey && titleEl.dataset.rymExtKey === primaryKey) {
        const existing = titleEl.querySelector(".rym-ext-badge-youtube");
        if (existing) {
          return;
        }
      }
      titleEl.dataset.rymExtKey = primaryKey || "";

      attachBadge(titleEl, meta.artist, meta.title, meta.mediaType, keys, cache, debug);
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

  function attachBadge(
    target,
    artist,
    title,
    mediaType = "release",
    cachedKeys = null,
    cache,
    debug
  ) {
    if (!target || !artist || !title) return;
    const keys = cachedKeys || alternativeKeys(artist, title);
    const existing = target.querySelector(".rym-ext-badge-youtube");

    // Find the match first
    const match = keys.map((key) => cache.index?.[key]).find(Boolean);
    if (!match) {
      // No match found - remove existing badge if present
      if (existing) existing.remove();
      return;
    }

    if (!isMatchable(match, mediaType)) {
      // Not matchable - remove existing badge if present
      if (existing) existing.remove();
      return;
    }

    // Check if existing badge is already correct
    if (existing?.dataset?.rymKey && keys.includes(existing.dataset.rymKey)) {
      // Badge exists and key matches - just update it in place
      updateBadge(existing, match, {
        prefix: "RYM",
        colorScheme: ColorSchemes.PROGRESSIVE,
        includeTitle: true,
        includeUrl: true,
      });
      return;
    }

    // Only remove and re-add if necessary
    if (existing) {
      existing.remove();
    }

    const badge = buildBadge(match, {
      className: "rym-ext-badge rym-ext-badge-youtube",
      prefix: "RYM",
      key: keys[0],
      colorScheme: ColorSchemes.PROGRESSIVE,
      includeTitle: true,
      includeUrl: true,
    });

    target.appendChild(badge);
    debug.log(`✓ badge: "${artist}" - "${title}" → ${match.ratingValue}`);
  }

  function textContent(node) {
    return node?.textContent ? collapseSpaces(node.textContent) : "";
  }

  function collapseSpaces(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  // Initialize overlay using common pattern
  // Note: YouTube uses custom observer logic for better performance
  const overlay = createOverlay({
    name: "youtube",
    settingsKey: "youtube",
    badgeClassName: "rym-ext-badge-youtube",
    isMatch: isYouTube,
    getStyles: getStyles,
    runScan: runScan,
    observerOptions: {
      useBadgeAware: false, // YouTube needs custom observer logic
      scanInterval: 5000,
      cooldown: 400,
    },
  });

  window.__RYM_YOUTUBE_DEBUG__ = overlay.debug;
})();
