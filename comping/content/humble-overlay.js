(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const alternativeKeys = api.alternativeKeys || ((artist, title) => [keyFor(artist, title)]);
  const fetchSettings = api.fetchSettings;
  const fetchCache = api.fetchCache;
  const createDebugger = api.createDebugger;
  const createScanScheduler = api.createScanScheduler;
  const buildBadge = api.buildBadge;
  const updateBadge = api.updateBadge;
  const isMatchable = api.isMatchable;
  const ColorSchemes = api.ColorSchemes;

  let cache = null;
  let settings = null;
  let scanner = null;

  const debug = createDebugger("gw-humble", {
    getCache: () => cache,
    rescan: () => scanner?.schedule(true),
  });
  const log = debug.log;
  const warn = debug.warn;

  window.__GW_HUMBLE_DEBUG__ = debug;

  init().catch((err) => warn("init failed", err));

  async function init() {
    if (!isHumble()) return;

    settings = await fetchSettings({ overlays: { humble: true } });
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
    log("Ready - cache entries:", Object.keys(cache.index).length);
  }

  function isHumble() {
    const host = window.location.hostname;
    return host.includes("humblebundle.com");
  }

  function observe() {
    scanner = createScanScheduler(runScan, { cooldown: 400 });
    scanner.schedule(true);

    const observer = new MutationObserver(() => scanner.schedule());
    observer.observe(document.body, { childList: true, subtree: true });

    setInterval(() => scanner.schedule(), 1500);
  }

  function runScan() {
    log("Running scan...");
    annotateAnchors();
    annotatePageTitle();
    log("Scan complete");
  }

  function annotateAnchors() {
    // Bundle page items (href="#")
    const bundleItems = document.querySelectorAll("a.js-item-details.item-details");
    log(`Found ${bundleItems.length} bundle items`);

    bundleItems.forEach((anchor, idx) => {
      const meta = extractMeta(anchor);
      if (idx < 5) log(`Bundle item ${idx}: title="${meta.title}"`);
      if (!meta.title) return;
      const target = anchor.querySelector(".item-title") || anchor;
      attachBadge(target, meta.title);
    });

    // Store page items
    const storeAnchors = document.querySelectorAll("a[href*='humblebundle.com/store/']");
    log(`Found ${storeAnchors.length} store items`);

    storeAnchors.forEach((anchor, idx) => {
      const meta = extractMeta(anchor);
      if (idx < 5) log(`Store item ${idx}: title="${meta.title}"`);
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

    // Try to get title from .item-title span (for bundle pages)
    const itemTitleSpan = anchor.querySelector(".item-title");
    const spanTitle = itemTitleSpan ? collapse(itemTitleSpan.textContent || "") : "";

    const textTitle = collapse(anchor.textContent || "");
    const title = collapse(attrTitle || spanTitle || textTitle);
    return { title };
  }

  function attachBadge(target, title) {
    if (!target || !title) return;
    const keys = alternativeKeys("", title);
    log(`Looking up "${title}" with keys:`, keys);

    const existing = target.querySelector?.(".gw-ext-badge");
    if (existing?.dataset?.rymKey && keys.includes(existing.dataset.rymKey)) {
      const match = cache.index[existing.dataset.rymKey];
      if (match) {
        updateBadge(existing, match, {
          prefix: "GW",
          colorScheme: ColorSchemes.PROGRESSIVE,
          includeTitle: true,
          includeUrl: true,
        });
      }
      return;
    }
    if (existing) existing.remove();

    const match = keys.map((key) => cache.index?.[key]).find(Boolean);
    if (!match) {
      log(`✗ No match for "${title}"`);
      return;
    }

    if (!isMatchable(match, "game")) {
      log(`✗ Match found but not a game: "${title}" (type: ${match.mediaType})`);
      return;
    }

    const badge = buildBadge(match, {
      className: "rym-ext-badge gw-ext-badge",
      prefix: "GW",
      key: keys[0],
      colorScheme: ColorSchemes.PROGRESSIVE,
      includeTitle: true,
      includeUrl: true,
    });

    target.appendChild(badge);
    log(`✓ badge: "${title}" → ${match.ratingValue}`);
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
