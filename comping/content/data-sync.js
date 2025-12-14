(function () {
  const api = window.__RYM_EXT__ || {};
  const SOURCES = api.SOURCES || {};
  const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || { sources: {}, overlays: {} };
  const sendMessage = api.sendMessage;
  const fetchSettings = api.fetchSettings;
  const delay = api.delay;
  const safeJsonParse = api.safeJsonParse;

  const MAX_RETRIES = 12;
  const RETRY_DELAY_MS = 500;

  main().catch((err) => console.warn("[rym-overlay] sync failed", err));

  async function main() {
    const settings = await (fetchSettings ? fetchSettings(DEFAULT_SETTINGS) : getSettings());
    const activeSources = pickSourcesForHost(location.host).filter(
      (source) => settings.sources[source.mediaType] !== false
    );

    for (const source of activeSources) {
      const raw = await waitForRecords(source.storageKey);
      if (!raw) {
        console.info("[rym-overlay] no tracker data found for", source.id);
        continue;
      }

      const parsed = safeJsonParse ? safeJsonParse(raw) : parse(raw);
      if (!parsed) continue;

      await sendMessage({
        type: "rym-cache-update",
        records: parsed,
        source: source.id,
        mediaType: source.mediaType,
        storageKey: source.storageKey,
      });
    }
  }

  async function getSettings() {
    try {
      const settings = await sendMessage({ type: "rym-settings-get" });
      return { ...DEFAULT_SETTINGS, ...settings };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  function pickSourcesForHost(host) {
    const entries = Object.values(SOURCES);
    return entries.filter((src) => src.hosts?.some((h) => host.includes(h)));
  }

  async function waitForRecords(storageKey) {
    const delayFn = delay || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    for (let i = 0; i < MAX_RETRIES; i++) {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
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
