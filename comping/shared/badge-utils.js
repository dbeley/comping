(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  /**
   * Color scheme options for badge rendering
   */
  const ColorSchemes = {
    LINEAR: "linear",
    PROGRESSIVE: "progressive",
  };

  /**
   * Calculate background and foreground colors for a rating value
   * @param {number} rating - Rating value (0-5)
   * @param {string} [scheme="linear"] - Color scheme to use ("linear" or "progressive")
   * @returns {{bg: string, fg: string}} Object with background and foreground colors
   */
  function getRatingColor(rating, scheme = ColorSchemes.LINEAR) {
    const clamped = Math.max(0, Math.min(5, rating));

    let normalized;
    if (scheme === ColorSchemes.PROGRESSIVE) {
      if (clamped < 3.0) {
        normalized = (clamped / 3.0) * 0.1;
      } else if (clamped < 4.0) {
        normalized = 0.1 + ((clamped - 3.0) / 1.0) * 0.7;
      } else {
        normalized = 0.8 + ((clamped - 4.0) / 1.0) * 0.2;
      }
    } else {
      normalized = clamped / 5;
    }

    const hue = scheme === ColorSchemes.LINEAR ? 20 + normalized * 110 : 120 * normalized;
    const saturation = scheme === ColorSchemes.PROGRESSIVE ? 65 : 75;
    const lightness = scheme === ColorSchemes.PROGRESSIVE ? 35 : 48 - normalized * 8;

    return {
      bg: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
      fg: "#ffffff",
    };
  }

  /**
   * Build a tooltip string for a cache entry
   * @param {Object} match - Cache entry object
   * @param {Object} [options={}] - Tooltip options
   * @param {boolean} [options.includeTitle] - Include title in tooltip
   * @param {boolean} [options.includeUrl] - Include source URL in tooltip
   * @returns {string} Formatted tooltip text
   */
  function buildTooltip(match, options = {}) {
    const bits = [];

    if (options.includeTitle && match.name) {
      const creator = match.artist || match.directors || "";
      bits.push(creator ? `${match.name} — ${creator}` : match.name);
    }

    if (match.ratingValue) {
      bits.push(`Rating: ${match.ratingValue}${match.maxRating ? "/" + match.maxRating : ""}`);
    }
    if (match.ratingCount) bits.push(`Ratings: ${match.ratingCount}`);
    if (match.reviewCount) bits.push(`Reviews: ${match.reviewCount}`);
    if (match.releaseDate) bits.push(`Year: ${match.releaseDate}`);
    if (match.updatedAt) {
      const date = new Date(match.updatedAt).toISOString().slice(0, 10);
      bits.push(`Cached: ${date}`);
    }
    if (options.includeUrl && match.url) bits.push(`Source: ${match.url}`);

    return bits.join(" · ");
  }

  /**
   * Create a badge element for displaying a rating
   * @param {Object} match - Cache entry with rating information
   * @param {Object} [options={}] - Badge rendering options
   * @param {string} [options.className="rym-ext-badge"] - CSS class name
   * @param {string} [options.prefix="RYM"] - Text prefix for badge
   * @param {string|null} [options.key=null] - Cache key to store in data attribute
   * @param {boolean} [options.compact=false] - Use compact badge style
   * @param {string} [options.colorScheme="linear"] - Color scheme to use
   * @param {boolean} [options.includeTitle=false] - Include title in tooltip
   * @param {boolean} [options.includeUrl=false] - Include URL in tooltip
   * @returns {HTMLElement} Badge element (anchor or span)
   */
  function buildBadge(match, options = {}) {
    const {
      className = "rym-ext-badge",
      prefix = "RYM",
      key = null,
      compact = false,
      colorScheme = ColorSchemes.LINEAR,
      includeTitle = false,
      includeUrl = false,
    } = options;

    const el = document.createElement(match.url ? "a" : "span");
    el.className = className;
    if (compact) el.classList.add(`${className}-compact`);
    if (key) el.dataset.rymKey = key;

    const rating = match.ratingValue || "?";
    el.textContent = `${prefix} ${rating}`;
    el.title = buildTooltip(match, { includeTitle, includeUrl });

    const ratingNum = parseFloat(rating);
    if (!isNaN(ratingNum)) {
      const color = getRatingColor(ratingNum, colorScheme);
      el.style.background = color.bg;
      el.style.color = color.fg;
    }

    if (match.url) {
      el.href = match.url;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
      el.style.textDecoration = "none";
    }

    return el;
  }

  /**
   * Update an existing badge element with new data
   * @param {HTMLElement} el - Badge element to update
   * @param {Object} match - Cache entry with updated rating information
   * @param {Object} [options={}] - Update options
   * @param {string} [options.prefix="RYM"] - Text prefix for badge
   * @param {string} [options.colorScheme="linear"] - Color scheme to use
   * @param {boolean} [options.includeTitle=false] - Include title in tooltip
   * @param {boolean} [options.includeUrl=false] - Include URL in tooltip
   */
  function updateBadge(el, match, options = {}) {
    if (!el || !match) return;

    const {
      prefix = "RYM",
      colorScheme = ColorSchemes.LINEAR,
      includeTitle = false,
      includeUrl = false,
    } = options;

    const rating = match.ratingValue || "?";
    const nextText = `${prefix} ${rating}`;
    if (el.textContent !== nextText) el.textContent = nextText;

    el.title = buildTooltip(match, { includeTitle, includeUrl });

    const ratingNum = parseFloat(rating);
    if (!isNaN(ratingNum)) {
      const color = getRatingColor(ratingNum, colorScheme);
      el.style.background = color.bg;
      el.style.color = color.fg;
    }
  }

  api.ColorSchemes = ColorSchemes;
  api.getRatingColor = getRatingColor;
  api.buildTooltip = buildTooltip;
  api.buildBadge = buildBadge;
  api.updateBadge = updateBadge;
})(typeof window !== "undefined" ? window : this);
