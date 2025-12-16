(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const buildBadge = api.buildBadge;
  const isFilmMatch = api.isFilmMatch;
  const text = api.text;
  const ColorSchemes = api.ColorSchemes;
  const createOverlay = api.createOverlay;

  function isJellyfin() {
    if (document.querySelector('meta[name="application-name"][content="Jellyfin"]')) {
      return true;
    }
    if (/jellyfin/i.test(window.location.hostname)) {
      return true;
    }
    return Boolean(document.querySelector('script[src*="jellyfin"], link[href*="jellyfin"]'));
  }

  function getStyles() {
    return `
      .rym-ext-jellyfin-container {
        position: relative;
      }
      .rym-ext-badge {
        font-family: "Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.2px;
      }
      .rym-ext-badge-jellyfin {
        position: absolute;
        top: 6px;
        left: 6px;
        padding: 4px 8px;
        border-radius: 12px;
        background: rgba(35, 35, 35, 0.85);
        color: #fff;
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
        z-index: 12;
        text-decoration: none;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .rym-ext-badge-jellyfin:hover {
        transform: translateY(-1px);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4);
      }
    `;
  }

  function runScan(cache, settings, debug) {
    annotateMovieCards(cache, debug);
  }

  function annotateMovieCards(cache, debug) {
    const cards = document.querySelectorAll(
      '.card[data-type="Movie"], .card[data-mediatype="Video"][data-context="movies"]'
    );
    cards.forEach((card, idx) => {
      card.querySelectorAll(".rym-ext-badge-jellyfin").forEach((b) => b.remove());

      const info = extractCardInfo(card);
      if (!info.title) {
        if (idx < 3) debug.log("No title found for card", card);
        return;
      }

      const match = findMatch(cache, info);
      if (!match) {
        if (idx < 3) debug.log(`No match for "${info.title}"`);
        return;
      }

      const target = card.querySelector(".cardScalable, .cardImageContainer, .cardBox") || card;
      if (!target) return;

      target.classList.add("rym-ext-jellyfin-container");

      const badge = buildBadge(match, {
        className: "rym-ext-badge rym-ext-badge-jellyfin",
        prefix: "RYM",
        colorScheme: ColorSchemes.LINEAR,
        includeTitle: true,
      });

      target.appendChild(badge);
      if (idx < 3) {
        debug.log(`✓ BADGE ATTACHED: "${info.title}" → ${match.ratingValue || "?"}`);
      }
    });
  }

  function extractCardInfo(card) {
    const imageLink = card.querySelector(".cardImageContainer");
    const titleFromLabel = imageLink?.getAttribute("aria-label") || "";
    const titleFromText = text(card.querySelector(".cardText-first"));
    const title = titleFromLabel || titleFromText;
    const year = text(card.querySelector(".cardText-secondary"));
    return { title, year };
  }

  function findMatch(cache, info) {
    if (!cache?.index || !info.title) return null;
    const keys = [keyFor("", info.title)];
    for (const key of keys) {
      const match = cache.index[key];
      if (match && isFilmMatch(match, info.year)) {
        return match;
      }
    }
    return null;
  }

  // Initialize overlay using common pattern
  const overlay = createOverlay({
    name: "jellyfin",
    settingsKey: "jellyfin",
    badgeClassName: "rym-ext-badge-jellyfin",
    isMatch: isJellyfin,
    getStyles: getStyles,
    runScan: runScan,
    observerOptions: {
      useBadgeAware: true,
    },
  });

  window.__RYM_JELLYFIN_DEBUG__ = overlay.debug;
})();
