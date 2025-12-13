(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  const MATCHABLE_TYPES = {
    release: ["release", "album"],
    song: ["song", "track", "single"],
    film: ["film", "movie"],
    game: ["game", "videogame", "video-game"],
  };

  function isMatchable(match, preferredType = null) {
    if (!match) return false;
    const matchType = (match.mediaType || "").toLowerCase();

    if (!preferredType) {
      return Object.values(MATCHABLE_TYPES).flat().includes(matchType);
    }

    const acceptableTypes = MATCHABLE_TYPES[preferredType] || [preferredType];
    return acceptableTypes.includes(matchType);
  }

  function isFilmMatch(match, yearHint = null) {
    if (!isMatchable(match, "film")) return false;
    if (!yearHint || !match.releaseDate) return true;
    return match.releaseDate.includes(yearHint);
  }

  api.MATCHABLE_TYPES = MATCHABLE_TYPES;
  api.isMatchable = isMatchable;
  api.isFilmMatch = isFilmMatch;
})(typeof window !== "undefined" ? window : this);
