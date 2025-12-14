(function () {
  // Cross-browser compatibility: Firefox uses 'browser', Chrome uses 'chrome'
  const browser = globalThis.browser || globalThis.chrome;

  if (typeof importScripts === "function") {
    try {
      importScripts("shared/normalize.js", "shared/config.js");
    } catch (err) {
      console.warn("[rym-overlay][bg] unable to import shared scripts", err);
    }
  }

  const api = typeof self !== "undefined" ? self.__RYM_EXT__ || {} : {};
  const normalize = api.normalize || ((text) => (text || "").toLowerCase().trim());
  const keyFor = api.keyFor || ((artist, title) => `${normalize(artist)}|${normalize(title)}`);
  const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || {
    sources: { release: true, song: true, film: true, game: true },
    overlays: {
      spotify: true,
      youtube: true,
      navidrome: true,
      lastfm: true,
      steam: true,
      jellyfin: true,
      humble: true,
    },
  };

  const CACHE_KEY = "rym-cache-v2";
  const SETTINGS_KEY = "rym-settings";
  let cache = null;
  let settingsCache = null;

  browser.runtime.onInstalled.addListener(seedDefaults);

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) {
      sendResponse(undefined);
      return;
    }

    if (message.type === "rym-cache-update") {
      const source = message.source || "unknown";
      const mediaType = message.mediaType || "release";
      console.debug("[rym-overlay][bg] received cache update", {
        source,
        mediaType,
        entries: Array.isArray(message.records)
          ? message.records.length
          : message.records
            ? Object.keys(message.records).length
            : 0,
      });
      handleCacheUpdate(message.records, { source, mediaType })
        .then(sendResponse)
        .catch((err) => {
          console.error("[rym-overlay][bg] cache update failed", err);
          sendResponse({ ok: false, error: err.message });
        });
      return true; // Indicates async response
    }

    if (message.type === "rym-cache-request") {
      loadCache()
        .then(sendResponse)
        .catch((err) => {
          console.error("[rym-overlay][bg] cache request failed", err);
          sendResponse(null);
        });
      return true;
    }

    if (message.type === "rym-settings-get") {
      loadSettings()
        .then(sendResponse)
        .catch((err) => {
          console.error("[rym-overlay][bg] settings get failed", err);
          sendResponse(DEFAULT_SETTINGS);
        });
      return true;
    }

    if (message.type === "rym-settings-set") {
      saveSettings(message.settings || {})
        .then(sendResponse)
        .catch((err) => {
          console.error("[rym-overlay][bg] settings set failed", err);
          sendResponse(null);
        });
      return true;
    }

    if (message.type === "rym-cache-export") {
      handleExport()
        .then(sendResponse)
        .catch((err) => {
          console.error("[rym-overlay][bg] export failed", err);
          sendResponse({ csv: "", count: 0, lastSync: null });
        });
      return true;
    }

    if (message.type === "rym-cache-clear") {
      handleCacheClear()
        .then(sendResponse)
        .catch((err) => {
          console.error("[rym-overlay][bg] cache clear failed", err);
          sendResponse({ ok: false, error: err.message });
        });
      return true;
    }

    sendResponse(undefined);
  });

  async function seedDefaults() {
    const stored = await new Promise((resolve) => {
      browser.storage.local.get(SETTINGS_KEY, resolve);
    });
    if (!stored[SETTINGS_KEY]) {
      await new Promise((resolve) => {
        browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS }, resolve);
      });
    }
  }

  async function handleCacheUpdate(records, meta) {
    const settings = await loadSettings();
    if (settings.sources[meta.mediaType] === false) {
      console.debug("[rym-overlay][bg] skip update because source disabled", {
        mediaType: meta.mediaType,
        setting: settings.sources[meta.mediaType],
      });
      return { ok: false, skipped: true };
    }

    const normalizedRecords = normalizeRecords(records || {}, meta);
    const merged = mergeRecords(cache?.entries || [], normalizedRecords);
    const index = indexRecords(merged);
    const next = {
      entries: merged,
      index,
      lastSync: Date.now(),
      source: meta.source,
    };
    cache = next;
    await new Promise((resolve) => {
      browser.storage.local.set({ [CACHE_KEY]: next }, resolve);
    });
    console.debug("[rym-overlay][bg] cache updated successfully", {
      mediaType: meta.mediaType,
      count: normalizedRecords.length,
      totalEntries: merged.length,
    });
    return { ok: true, count: normalizedRecords.length };
  }

  async function handleExport() {
    const current = await loadCache();
    const entries = current?.entries || [];
    return {
      csv: buildCsv(entries),
      count: entries.length,
      lastSync: current?.lastSync || null,
    };
  }

  async function handleCacheClear() {
    await new Promise((resolve) => {
      browser.storage.local.remove(CACHE_KEY, resolve);
    });
    cache = null;
    console.debug("[rym-overlay][bg] cache cleared successfully");
    return { ok: true };
  }

  async function loadSettings() {
    if (settingsCache) return settingsCache;
    const stored = await new Promise((resolve) => {
      browser.storage.local.get(SETTINGS_KEY, resolve);
    });
    settingsCache = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
    return settingsCache;
  }

  async function saveSettings(next) {
    const current = await loadSettings();
    const merged = {
      sources: { ...current.sources, ...(next.sources || {}) },
      overlays: { ...current.overlays, ...(next.overlays || {}) },
    };
    settingsCache = merged;
    await new Promise((resolve) => {
      browser.storage.local.set({ [SETTINGS_KEY]: merged }, resolve);
    });
    return merged;
  }

  async function loadCache() {
    if (cache) return cache;
    const stored = await new Promise((resolve) => {
      browser.storage.local.get(CACHE_KEY, resolve);
    });
    cache = stored[CACHE_KEY] || null;
    return cache;
  }

  function normalizeRecords(input, meta) {
    const entries = Array.isArray(input)
      ? input.filter(Boolean)
      : Object.values(input || {}).filter(Boolean);
    return entries.map((entry) => normalizeEntry(entry, meta));
  }

  function normalizeEntry(entry, meta) {
    const mediaType = meta.mediaType || "release";
    const sourceId = meta.source || "unknown";
    const slug = entry.slug || entry.id || `${mediaType}-${entry.name || "unknown"}`;
    return {
      mediaType,
      sourceId,
      slug,
      name: entry.name || "",
      artist: entry.artist || "",
      directors: entry.directors || "",
      album: entry.album || "",
      albumUrl: entry.albumUrl || "",
      type: entry.type || "",
      releaseDate: entry.releaseDate || "",
      rank: entry.rank || "",
      ratingValue: entry.ratingValue || "",
      maxRating: entry.maxRating || "",
      ratingCount: entry.ratingCount || "",
      reviewCount: entry.reviewCount || "",
      primaryGenres: entry.primaryGenres || entry.genres || "",
      secondaryGenres: entry.secondaryGenres || "",
      descriptors: entry.descriptors || "",
      languages: entry.languages || "",
      platforms: entry.platforms || "",
      operatingSystems: entry.operatingSystems || "",
      image: entry.image || "",
      description: entry.description || "",
      url: entry.url || "",
      updatedAt: entry.updatedAt || new Date().toISOString(),
      firstSeen: entry.firstSeen || entry.updatedAt || new Date().toISOString(),
      isPartial: entry.isPartial,
    };
  }

  function mergeRecords(existingEntries, incomingEntries) {
    const byKey = new Map();

    for (const entry of existingEntries) {
      const key = `${entry.mediaType}::${entry.slug}`;
      byKey.set(key, entry);
    }

    for (const entry of incomingEntries) {
      const key = `${entry.mediaType}::${entry.slug}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, entry);
        continue;
      }

      if (entry.isPartial && !existing.isPartial) {
        continue;
      }

      const merged = {
        ...existing,
        ...entry,
        isPartial: entry.isPartial ?? existing.isPartial,
      };
      byKey.set(key, merged);
    }

    return Array.from(byKey.values());
  }

  function indexRecords(entries) {
    const index = {};
    for (const entry of entries) {
      const name = entry.name || "";
      const artist = entry.artist || "";
      const key = keyFor(artist, name);
      if (!key.trim()) continue;
      const existing = index[key];
      if (existing && !existing.isPartial && entry.isPartial) continue;
      index[key] = entry;
    }
    return index;
  }

  function escapeCsv(value) {
    const str = value == null ? "" : String(value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildCsv(entries) {
    if (!entries || entries.length === 0) return "";
    const header = [
      "mediaType",
      "sourceId",
      "slug",
      "name",
      "artist",
      "directors",
      "album",
      "albumUrl",
      "type",
      "releaseDate",
      "rank",
      "ratingValue",
      "maxRating",
      "ratingCount",
      "reviewCount",
      "primaryGenres",
      "secondaryGenres",
      "descriptors",
      "languages",
      "platforms",
      "operatingSystems",
      "image",
      "description",
      "url",
      "updatedAt",
      "firstSeen",
      "isPartial",
    ];

    const lines = [header.join(",")];
    for (const entry of entries) {
      const row = header.map((field) => escapeCsv(entry[field] === undefined ? "" : entry[field]));
      lines.push(row.join(","));
    }
    return lines.join("\n");
  }
})();
