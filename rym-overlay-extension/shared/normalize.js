(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  // Common game version suffixes to strip for better matching
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

  function normalize(text) {
    if (!text) return "";
    const stripped = text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return stripped.replace(/[^a-z0-9]+/g, " ").trim();
  }

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

  function keyFor(artist, title) {
    return `${normalize(artist)}|${normalize(title)}`;
  }

  // Generate alternative keys for matching (with version suffix stripped)
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
