(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const MATCHABLE_TYPES = ["release", "song"];
  let cache = null;
  let settings = null;
  let styleInjected = false;
  let observer = null;

  init().catch((err) => console.warn("[rym-overlay] bandcamp init failed", err));

  async function init() {
    settings = await fetchSettings();
    if (!settings.overlays?.bandcamp) return;
    cache = await fetchCache();
    if (!cache || !cache.index) return;
    injectStyles();
    observe();
  }

  async function fetchSettings() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-settings-get" });
    } catch (_) {
      return { overlays: { bandcamp: true } };
    }
  }

  async function fetchCache() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-cache-request" });
    } catch (_) {
      return null;
    }
  }

  function observe() {
    scan();
    observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scan() {
    const rows = document.querySelectorAll(".track_row_view, .track-row");
    rows.forEach((row) => annotateTrackRow(row));
    annotateStandaloneTrack();
  }

  function annotateTrackRow(row) {
    if (row.dataset.rymAnnotated) return;
    const title =
      row.querySelector(".track-title")?.textContent ||
      row.querySelector(".title")?.textContent ||
      "";
    const artist = deriveArtist(row);
    const key = keyFor(artist, title);
    if (!key.trim()) return;
    const match = cache.index[key];
    if (!match || !isMatchable(match)) return;
    row.dataset.rymAnnotated = "1";

    const target =
      row.querySelector(".track-title") ||
      row.querySelector(".title") ||
      row.querySelector(".track_number");
    if (!target || target.querySelector(".rym-ext-badge")) return;

    const badge = buildBadge(match);
    target.appendChild(badge);
  }

  function annotateStandaloneTrack() {
    const title =
      document.querySelector(".trackTitle")?.textContent ||
      document.querySelector("h2.trackTitle")?.textContent ||
      "";
    const artist = deriveArtist();
    const key = keyFor(artist, title);
    if (!key.trim()) return;
    const match = cache.index[key];
    if (!match || !isMatchable(match)) return;

    const target = document.querySelector(".trackTitle") || document.querySelector("h2.trackTitle");
    if (!target || target.querySelector(".rym-ext-badge")) return;
    const badge = buildBadge(match);
    target.appendChild(badge);
  }

  function deriveArtist(contextNode) {
    const inline =
      contextNode?.querySelector(".artist")?.textContent ||
      contextNode?.querySelector(".trackArtist")?.textContent ||
      "";
    if (inline) return inline.trim();
    const header =
      document.querySelector("#name-section .artist")?.textContent ||
      "";
    const metaTitle =
      document.querySelector("meta[property='og:site_name']")?.content ||
      document.querySelector("meta[name='title']")?.content ||
      "";
    const parsed =
      parseBy(metaTitle) ||
      parseBy(header) ||
      header ||
      metaTitle;
    return (parsed || "").replace(/^by\s+/i, "").trim();
  }

  function parseBy(text) {
    if (!text) return "";
    const match = text.match(/by\s+(.+)$/i);
    return match ? match[1] : "";
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-bc";
    const rating = match.ratingValue || "?";
    link.textContent = `RYM ${rating}`;
    link.title = buildTooltip(match);
    if (match.url) {
      link.href = match.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.style.textDecoration = "none";
    }
    return link;
  }

  function buildTooltip(match) {
    const bits = [];
    bits.push(`${match.artist} — ${match.name}`);
    if (match.ratingValue) {
      bits.push(`Rating: ${match.ratingValue}${match.maxRating ? "/" + match.maxRating : ""}`);
    }
    if (match.ratingCount) bits.push(`Ratings: ${match.ratingCount}`);
    if (match.reviewCount) bits.push(`Reviews: ${match.reviewCount}`);
    if (match.updatedAt) bits.push(`Cached: ${match.updatedAt}`);
    if (match.url) bits.push(`Source: ${match.url}`);
    return bits.join(" · ");
  }

  function injectStyles() {
    if (styleInjected) return;
    styleInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      .rym-ext-badge {
        margin-left: 6px;
        padding: 2px 6px;
        border-radius: 12px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.3px;
        vertical-align: middle;
        cursor: default;
        display: inline-flex;
        align-items: center;
        background: #ffc400;
        color: #202020;
      }
      .rym-ext-badge-bc {
        background: #08fdd8;
        color: #003b32;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function isMatchable(match) {
    return MATCHABLE_TYPES.includes(match.mediaType || "release");
  }
})();
