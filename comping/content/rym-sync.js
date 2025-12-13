(function () {
  // Cross-browser compatibility: Firefox uses 'browser', Chrome uses 'chrome'
  const browser = globalThis.browser || globalThis.chrome;

  const api = window.__RYM_EXT__ || {};
  const delay = api.delay;
  const safeJsonParse = api.safeJsonParse;

  const STORAGE_KEY = "rateyourmusic-csv::records";
  const MAX_RETRIES = 12;
  const RETRY_DELAY_MS = 500;

  syncFromLocal().catch((err) => console.warn("[rym-overlay] sync failed", err));

  async function syncFromLocal() {
    console.debug("[rym-overlay] rym-sync content script loaded");
    const raw = await waitForRecords();
    if (!raw) {
      console.info("[rym-overlay] no CSV tracker data found in localStorage.");
      return;
    }

    const parsed = safeJsonParse ? safeJsonParse(raw) : parse(raw);
    if (!parsed) return;

    console.debug("[rym-overlay] sending cache update", {
      entries: Array.isArray(parsed) ? parsed.length : parsed ? Object.keys(parsed).length : 0,
      source: location.href,
    });
    await browser.runtime.sendMessage({
      type: "rym-cache-update",
      records: parsed,
      source: location.href,
    });
  }

  async function waitForRecords() {
    const delayFn = delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    for (let i = 0; i < MAX_RETRIES; i++) {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        console.debug("[rym-overlay] found records in localStorage", {
          length: raw.length,
          attempt: i + 1,
        });
        return raw;
      }
      await delayFn(RETRY_DELAY_MS);
    }
    return null;
  }

  function parse(raw) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.warn("[rym-overlay] unable to parse stored records", err);
      return null;
    }
  }
})();
