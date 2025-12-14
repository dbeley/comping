(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  const ColorSchemes = {
    LINEAR: "linear",
    PROGRESSIVE: "progressive",
  };

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
