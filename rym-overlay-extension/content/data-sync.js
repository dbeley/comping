(function () {
  const api = window.__RYM_EXT__ || {};
  const SOURCES = api.SOURCES || {};
  const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || { sources: {}, overlays: {} };
  const MAX_RETRIES = 12;
  const RETRY_DELAY_MS = 500;

  main().catch((err) => console.warn("[rym-overlay] sync failed", err));

  async function main() {
    const settings = await fetchSettings();
    const activeSources = pickSourcesForHost(location.host).filter((source) =>
      settings.sources[source.mediaType] !== false
    );

    for (const source of activeSources) {
      const raw = await waitForRecords(source.storageKey);
      if (!raw) {
        console.info("[rym-overlay] no tracker data found for", source.id);
        continue;
      }

      const parsed = parse(raw);
      if (!parsed) continue;

      await browser.runtime.sendMessage({
        type: "rym-cache-update",
        records: parsed,
        source: source.id,
        mediaType: source.mediaType,
        storageKey: source.storageKey,
      });
    }
  }

  async function fetchSettings() {
    try {
      const settings = await browser.runtime.sendMessage({ type: "rym-settings-get" });
      return { ...DEFAULT_SETTINGS, ...settings };
    } catch (_) {
      return DEFAULT_SETTINGS;
    }
  }

  function pickSourcesForHost(host) {
    const entries = Object.values(SOURCES);
    return entries.filter((src) => src.hosts?.some((h) => host.includes(h)));
  }

  async function waitForRecords(storageKey) {
    for (let i = 0; i < MAX_RETRIES; i++) {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        return raw;
      }
      await delay(RETRY_DELAY_MS);
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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
