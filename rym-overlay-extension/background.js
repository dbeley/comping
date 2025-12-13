(function () {
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
  const FALLBACK_SOURCES = {
    releases: {
      id: "releases",
      label: "RYM releases",
      storageKey: "rateyourmusic-csv::records",
      mediaType: "release",
      hosts: [],
    },
    songs: {
      id: "songs",
      label: "RYM tracks",
      storageKey: "rateyourmusic-song-csv::records",
      mediaType: "song",
      hosts: [],
    },
    films: {
      id: "films",
      label: "RYM movies",
      storageKey: "rateyourmusic-film-csv::records",
      mediaType: "film",
      hosts: [],
    },
    games: {
      id: "games",
      label: "Glitchwave games",
      storageKey: "glitchwave-csv::records",
      mediaType: "game",
      hosts: [],
    },
  };
  const FALLBACK_TARGETS = {
    spotify: { id: "spotify", label: "Spotify", mediaType: "music" },
    youtube: { id: "youtube", label: "YouTube", mediaType: "music" },
    navidrome: { id: "navidrome", label: "Navidrome", mediaType: "music" },
    bandcamp: { id: "bandcamp", label: "Bandcamp", mediaType: "music" },
    lastfm: { id: "lastfm", label: "Last.fm", mediaType: "music" },
    deezer: { id: "deezer", label: "Deezer", mediaType: "music" },
    steam: { id: "steam", label: "Steam", mediaType: "game" },
    humble: { id: "humble", label: "Humble Bundle", mediaType: "game" },
    jellyfin: { id: "jellyfin", label: "Jellyfin", mediaType: "film" },
  };
  const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || {
    sources: Object.fromEntries(
      Object.values(FALLBACK_SOURCES).map((src) => [src.mediaType, true])
    ),
    overlays: Object.fromEntries(Object.values(FALLBACK_TARGETS).map((t) => [t.id, true])),
  };

  const CACHE_KEY = "rym-cache-v2";
  const SETTINGS_KEY = "rym-settings";
  let cache = null;
  let settingsCache = null;

  browser.runtime.onInstalled.addListener(seedDefaults);

  browser.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;

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
      return handleCacheUpdate(message.records, { source, mediaType });
    }

    if (message.type === "rym-cache-request") {
      return loadCache();
    }

    if (message.type === "rym-lookup") {
      return handleLookup(message.keys || []);
    }

    if (message.type === "rym-settings-get") {
      return loadSettings();
    }

    if (message.type === "rym-settings-set") {
      return saveSettings(message.settings || {});
    }

    if (message.type === "rym-cache-export") {
      return handleExport();
    }
  });

  async function seedDefaults() {
    const stored = await browser.storage.local.get(SETTINGS_KEY);
    if (!stored[SETTINGS_KEY]) {
      await browser.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
    }
  }

  async function handleCacheUpdate(records, meta) {
    const settings = await loadSettings();
    if (!settings.sources[meta.mediaType]) {
      console.debug("[rym-overlay][bg] skip update because source disabled", meta.mediaType);
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
    await browser.storage.local.set({ [CACHE_KEY]: next });
    return { ok: true, count: normalizedRecords.length };
  }

  async function handleLookup(keys) {
    const current = await loadCache();
    if (!current) return { matches: {}, lastSync: null };

    const matches = {};
    for (const key of keys) {
      if (current.index[key]) {
        matches[key] = current.index[key];
      }
    }
    return { matches, lastSync: current.lastSync || null };
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

  async function loadSettings() {
    if (settingsCache) return settingsCache;
    const stored = await browser.storage.local.get(SETTINGS_KEY);
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
    await browser.storage.local.set({ [SETTINGS_KEY]: merged });
    return merged;
  }

  async function loadCache() {
    if (cache) return cache;
    const stored = await browser.storage.local.get(CACHE_KEY);
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
