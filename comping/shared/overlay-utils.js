(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  /**
   * Create a standardized overlay initializer
   * @param {Object} config - Configuration object
   * @param {string} config.name - Overlay name for logging
   * @param {string} config.settingsKey - Key in settings.overlays
   * @param {string} config.badgeClassName - CSS class for badges
   * @param {Function} config.isMatch - Function to check if current page matches
   * @param {Function} config.getStyles - Function returning CSS string
   * @param {Function} config.runScan - Function to scan and annotate page
   * @param {Object} [config.observerOptions] - Options for observer
   * @param {boolean} [config.observerOptions.useBadgeAware=true] - Use badge-aware observer
   * @param {number} [config.observerOptions.scanInterval] - Interval for periodic scans (ms)
   * @param {number} [config.observerOptions.cooldown=0] - Cooldown between scans (ms)
   * @returns {Object} Overlay instance with debug helpers
   */
  function createOverlay(config) {
    const {
      name,
      settingsKey,
      badgeClassName,
      isMatch,
      getStyles,
      runScan,
      observerOptions = {},
    } = config;

    const { useBadgeAware = true, scanInterval = null, cooldown = 0 } = observerOptions;

    let cache = null;
    let settings = null;
    let styleInjected = false;
    let observer = null;
    let scanner = null;

    const createDebugger = api.createDebugger;
    const fetchSettings = api.fetchSettings;
    const fetchCache = api.fetchCache;
    const getCacheStats = api.getCacheStats;
    const createBadgeAwareMutationObserver = api.createBadgeAwareMutationObserver;
    const createScanScheduler = api.createScanScheduler;

    const debug = createDebugger(`rym-${name}`, {
      getCache: () => cache,
      getCacheStats: () => getCacheStats(cache),
      rescan: () => scanner && scanner.schedule(true),
    });

    const log = debug.log;
    const warn = debug.warn;

    async function init() {
      log("Initializing...");

      if (!isMatch()) {
        log("Page does not match");
        return;
      }

      log("Page matched");

      const settingsDefaults = { overlays: { [settingsKey]: true } };
      settings = await fetchSettings(settingsDefaults);

      if (!settings.overlays?.[settingsKey]) {
        log("Overlay disabled in settings");
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

    function injectStyles() {
      if (styleInjected) return;
      styleInjected = true;
      const style = document.createElement("style");
      style.textContent = getStyles();
      document.head.appendChild(style);
    }

    function observe() {
      scanner = createScanScheduler(() => runScan(cache, settings, debug), { cooldown });
      scanner.schedule(true);

      if (useBadgeAware) {
        observer = createBadgeAwareMutationObserver(badgeClassName, () => {
          scanner.schedule(true);
        });
      } else {
        observer = new MutationObserver(() => {
          scanner.schedule(true);
        });
      }

      observer.observe(document.body, { childList: true, subtree: true });

      if (scanInterval) {
        setInterval(() => scanner.schedule(), scanInterval);
      }
    }

    init().catch((err) => warn("init failed", err));

    return {
      debug,
      getCache: () => cache,
      getSettings: () => settings,
      rescan: () => scanner && scanner.schedule(true),
    };
  }

  api.createOverlay = createOverlay;
})(typeof window !== "undefined" ? window : this);
