(function () {
  let DEBUG = false;
  const log = (...args) => DEBUG && console.log("[gw-humble]", ...args);
  const warn = (...args) => console.warn("[gw-humble]", ...args);

  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const alternativeKeys = api.alternativeKeys || ((artist, title) => [keyFor(artist, title)]);

  let cache = null;
  let settings = null;
  let scanTimer = null;
  let lastScanAt = 0;
  const SCAN_COOLDOWN_MS = 400;

  window.__GW_HUMBLE_DEBUG__ = {
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
    if (!isHumble()) return;

    settings = await fetchSettings();
    if (!settings?.overlays?.humble) {
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
      return { overlays: { humble: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch {
      return null;
    }
  }

  function isHumble() {
    const host = window.location.hostname;
    return host.includes("humblebundle.com");
  }

  function observe() {
    const observer = new MutationObserver(() => scheduleScan());
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
        annotatePageTitle();
      },
      force ? 0 : SCAN_COOLDOWN_MS
    );
  }

  function annotateAnchors() {
    const anchors = document.querySelectorAll("a[href*='humblebundle.com/store/']");
    anchors.forEach((anchor) => {
      const meta = extractMeta(anchor);
      if (!meta.title) return;
      attachBadge(anchor, meta.title);
    });
  }

  function annotatePageTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute("content");
    const title = normalizeTitleFromOg(ogTitle);
    if (!title) return;

    const header =
      document.querySelector("h1") ||
      document.querySelector("[data-human-name]") ||
      document.querySelector(".entity-title, .page-title");
    const target = header || document.querySelector("title");
    if (!target) return;

    if (target.dataset?.rymExtKey === title) return;
    target.dataset.rymExtKey = title;
    attachBadge(target, title);
  }

  function normalizeTitleFromOg(ogTitle) {
    if (!ogTitle) return "";
    const match = ogTitle.match(/Buy (.+?) from the Humble Store/i);
    if (match) return match[1].trim();
    return ogTitle.trim();
  }

  function extractMeta(anchor) {
    const attrTitle =
      anchor.dataset?.humanName ||
      anchor.getAttribute("data-human-name") ||
      anchor.getAttribute("aria-label");
    const textTitle = collapse(anchor.textContent || "");
    const title = collapse(attrTitle || textTitle);
    return { title };
  }

  function attachBadge(target, title) {
    if (!target || !title) return;
    const keys = alternativeKeys("", title);
    const existing = target.querySelector?.(".gw-ext-badge");
    if (existing?.dataset?.rymKey && keys.includes(existing.dataset.rymKey)) {
      updateBadge(existing, cache.index[existing.dataset.rymKey]);
      return;
    }
    if (existing) existing.remove();

    const match = keys.map((key) => cache.index?.[key]).find(Boolean);
    if (!match) return;
    if (!isMatchable(match)) return;

    const badge = buildBadge(match, keys[0]);
    target.appendChild(badge);
    log(`✓ badge: "${title}" → ${match.ratingValue}`);
  }

  function isMatchable(match) {
    const type = (match.mediaType || "").toLowerCase();
    return type === "game";
  }

  function buildBadge(match, key) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge gw-ext-badge";
    link.dataset.rymKey = key || "";
    const rating = match.ratingValue || "?";
    link.textContent = `GW ${rating}`;
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
    const nextText = `GW ${rating}`;
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
    if (document.getElementById("rym-ext-humble-styles")) return;
    const style = document.createElement("style");
    style.id = "rym-ext-humble-styles";
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
      .gw-ext-badge {
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function collapse(str) {
    return (str || "").replace(/\s+/g, " ").trim();
  }
})();
