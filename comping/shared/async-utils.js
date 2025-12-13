(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function safeJsonParse(raw, fallback = null) {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[async-utils] unable to parse JSON", err);
      return fallback;
    }
  }

  api.delay = delay;
  api.safeJsonParse = safeJsonParse;
})(typeof window !== "undefined" ? window : this);
