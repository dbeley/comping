(function (global) {
  // Cross-browser compatibility: Firefox uses 'browser', Chrome uses 'chrome'
  const browser = globalThis.browser || globalThis.chrome;

  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});
  const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || { sources: {}, overlays: {} };

  // Helper to ensure sendMessage always returns a Promise (Chrome MV2 uses callbacks)
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      browser.runtime.sendMessage(message, (response) => {
        if (browser.runtime.lastError) {
          reject(browser.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }

  async function fetchSettings(defaults = DEFAULT_SETTINGS) {
    try {
      const settings = await sendMessage({ type: "rym-settings-get" });
      return { ...defaults, ...settings };
    } catch (err) {
      console.warn("[runtime-utils] failed to fetch settings, using defaults", err);
      return defaults;
    }
  }

  async function fetchCache() {
    try {
      return await sendMessage({ type: "rym-cache-request" });
    } catch (err) {
      console.warn("[runtime-utils] failed to fetch cache", err);
      return null;
    }
  }

  async function lookupKeys(keys) {
    try {
      return await sendMessage({ type: "rym-lookup", keys });
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

  api.sendMessage = sendMessage;
  api.fetchSettings = fetchSettings;
  api.fetchCache = fetchCache;
  api.lookupKeys = lookupKeys;
  api.getCacheStats = getCacheStats;
})(typeof window !== "undefined" ? window : this);
