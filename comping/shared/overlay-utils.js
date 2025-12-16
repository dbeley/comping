(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  /**
   * Create a standardized overlay initializer to reduce duplication across overlay implementations.
   *
   * This function handles common tasks like:
   * - Checking if the current page matches the overlay's target
   * - Loading settings and cache
   * - Injecting styles
   * - Setting up mutation observers
   * - Scheduling scans
   *
   * @param {Object} config - Configuration object for the overlay
   * @param {string} config.name - Overlay name for logging (e.g., "spotify", "youtube")
   * @param {string} config.settingsKey - Key in settings.overlays to check if overlay is enabled
   * @param {string} config.badgeClassName - CSS class name for badges created by this overlay
   * @param {Function} config.isMatch - Function that returns true if current page matches this overlay
   * @param {Function} config.getStyles - Function that returns CSS string to inject
   * @param {Function} config.runScan - Function to scan page and add badges (receives cache, settings, debug)
   * @param {Object} [config.observerOptions] - Options for mutation observer and scanner
   * @param {boolean} [config.observerOptions.useBadgeAware=true] - Use badge-aware observer to ignore badge mutations
   * @param {number} [config.observerOptions.scanInterval] - Interval for periodic scans in ms (optional)
   * @param {number} [config.observerOptions.cooldown=0] - Minimum time between scans in ms
   * @returns {Object} Overlay instance with debug helpers and control methods
   * @returns {Object} return.debug - Debug API with log/warn/error and helper functions
   * @returns {Function} return.getCache - Get current cache
   * @returns {Function} return.getSettings - Get current settings
   * @returns {Function} return.rescan - Trigger a manual rescan
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
