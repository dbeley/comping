(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  /**
   * Common game/film version suffixes to strip for better matching
   * These are removed when generating alternative cache keys
   */
  const VERSION_SUFFIXES = [
    "- The Final Cut",
    "- Final Cut",
    "The Final Cut",
    "- Director's Cut",
    "Director's Cut",
    "- Definitive Edition",
    "Definitive Edition",
    "- Enhanced Edition",
    "Enhanced Edition",
    "- Remastered",
    "Remastered",
    "- Remake",
    "Remake",
    "- Complete Edition",
    "Complete Edition",
    "- Game of the Year Edition",
    "Game of the Year Edition",
    "- GOTY Edition",
    "GOTY Edition",
    "- GOTY",
    "GOTY",
    "- Deluxe Edition",
    "Deluxe Edition",
    "- Ultimate Edition",
    "Ultimate Edition",
    "- Collector's Edition",
    "Collector's Edition",
    "- Special Edition",
    "Special Edition",
    "- Gold Edition",
    "Gold Edition",
    "- Premium Edition",
    "Premium Edition",
    "- HD",
    "HD",
    "- 4K",
    "4K",
  ];

  /**
   * Normalize text for comparison by removing accents, converting to lowercase,
   * and removing non-alphanumeric characters except spaces
   * @param {string} text - Text to normalize
   * @returns {string} Normalized text suitable for comparison
   * @example normalize("Café Müller") // returns "cafe muller"
   */
  function normalize(text) {
    if (!text) return "";
    const stripped = text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return stripped.replace(/[^a-z0-9]+/g, " ").trim();
  }

  /**
   * Strip version suffixes from titles for better matching
   * @param {string} text - Title text that may contain version suffixes
   * @returns {string} Title with version suffix removed
   * @example stripVersionSuffix("Game - Remastered") // returns "Game"
   */
  function stripVersionSuffix(text) {
    if (!text) return text;

    let stripped = text.trim();

    // Try to remove each suffix (case-insensitive)
    for (const suffix of VERSION_SUFFIXES) {
      const regex = new RegExp(suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i");
      if (regex.test(stripped)) {
        stripped = stripped.replace(regex, "").trim();
        // Remove trailing colon or dash if present
        stripped = stripped.replace(/[\s:-]+$/, "").trim();
        break; // Only remove one suffix to avoid over-stripping
      }
    }

    return stripped;
  }

  /**
   * Generate a cache key for an artist and title combination
   * @param {string} artist - Artist/creator name
   * @param {string} title - Work title
   * @returns {string} Cache key in format "normalized_artist|normalized_title"
   * @example keyFor("The Beatles", "Abbey Road") // returns "the beatles|abbey road"
   */
  function keyFor(artist, title) {
    return `${normalize(artist)}|${normalize(title)}`;
  }

  /**
   * Generate alternative keys for matching, including version with suffix stripped
   * This improves matching for games/films with multiple editions
   * @param {string} artist - Artist/creator name
   * @param {string} title - Work title
   * @returns {string[]} Array of cache keys to try for matching
   * @example alternativeKeys("", "Game - Remastered")
   * // returns ["game remastered", "game"]
   */
  function alternativeKeys(artist, title) {
    const keys = [];

    // Primary key with full title
    keys.push(keyFor(artist, title));

    // Alternative key with version suffix stripped
    const strippedTitle = stripVersionSuffix(title);
    if (strippedTitle !== title) {
      keys.push(keyFor(artist, strippedTitle));
    }

    return keys;
  }

  api.normalize = normalize;
  api.keyFor = keyFor;
  api.stripVersionSuffix = stripVersionSuffix;
  api.alternativeKeys = alternativeKeys;
})(typeof window !== "undefined" ? window : this);
