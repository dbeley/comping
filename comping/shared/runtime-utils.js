(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});
  const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || { sources: {}, overlays: {} };

  async function fetchSettings(defaults = DEFAULT_SETTINGS) {
    try {
      const settings = await browser.runtime.sendMessage({ type: "rym-settings-get" });
      return { ...defaults, ...settings };
    } catch (err) {
      console.warn("[runtime-utils] failed to fetch settings, using defaults", err);
      return defaults;
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch (err) {
      console.warn("[runtime-utils] failed to fetch cache", err);
      return null;
    }
  }

  async function lookupKeys(keys) {
    try {
      return await browser.runtime.sendMessage({ type: "rym-lookup", keys });
    } catch (err) {
      console.warn("[runtime-utils] failed to lookup keys", err);
      return { matches: {}, lastSync: null };
    }
  }

  function getCacheStats(cache) {
    if (!cache?.index) return null;
    return Object.values(cache.index).reduce((acc, item) => {
      const type = item.mediaType || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }

  api.fetchSettings = fetchSettings;
  api.fetchCache = fetchCache;
  api.lookupKeys = lookupKeys;
  api.getCacheStats = getCacheStats;
})(typeof window !== "undefined" ? window : this);
