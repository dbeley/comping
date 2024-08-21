(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  const SOURCES = {
    releases: {
      id: "releases",
      label: "RYM releases",
      storageKey: "rateyourmusic-csv::records",
      mediaType: "release",
      hosts: ["rateyourmusic.com", "www.rateyourmusic.com", "rym.com", "www.rym.com"],
    },
    songs: {
      id: "songs",
      label: "RYM tracks",
      storageKey: "rateyourmusic-song-csv::records",
      mediaType: "song",
      hosts: ["rateyourmusic.com", "www.rateyourmusic.com", "rym.com", "www.rym.com"],
    },
    films: {
      id: "films",
      label: "RYM movies",
      storageKey: "rateyourmusic-film-csv::records",
      mediaType: "film",
      hosts: ["rateyourmusic.com", "www.rateyourmusic.com", "rym.com", "www.rym.com"],
    },
    games: {
      id: "games",
      label: "Glitchwave games",
      storageKey: "glitchwave-csv::records",
      mediaType: "game",
      hosts: ["glitchwave.com", "www.glitchwave.com"],
    },
  };

  const TARGETS = {
    spotify: { id: "spotify", label: "Spotify" },
    youtube: { id: "youtube", label: "YouTube" },
    navidrome: { id: "navidrome", label: "Navidrome" },
    bandcamp: { id: "bandcamp", label: "Bandcamp" },
    lastfm: { id: "lastfm", label: "Last.fm" },
    deezer: { id: "deezer", label: "Deezer" },
  };

  const DEFAULT_SETTINGS = {
    sources: Object.fromEntries(Object.values(SOURCES).map((src) => [src.mediaType, true])),
    overlays: Object.fromEntries(Object.values(TARGETS).map((t) => [t.id, true])),
  };

  api.SOURCES = SOURCES;
  api.TARGETS = TARGETS;
  api.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
})(typeof window !== "undefined" ? window : this);
