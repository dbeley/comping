(function () {
  const api = window.__RYM_EXT__ || {};
  const keyFor = api.keyFor || (() => "");
  const MATCHABLE_TYPES = ["release", "song"];
  let cache = null;
  let settings = null;
  let styleInjected = false;

  init().catch((err) => console.warn("[rym-overlay] lastfm init failed", err));

  async function init() {
    settings = await fetchSettings();
    if (!settings.overlays?.lastfm) return;
    cache = await fetchCache();
    if (!cache || !cache.index) return;
    injectStyles();
    observe();
  }

  async function fetchSettings() {
    try {
      return await browser.runtime.sendMessage({ type: "rym-settings-get" });
    } catch (_) {
      return { overlays: { lastfm: true } };
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
    const observer = new MutationObserver(() => scan());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function scan() {
    document.querySelectorAll(".chartlist-row").forEach((row) => annotateRow(row));
    document.querySelectorAll('[itemtype*="MusicRecording"]').forEach((node) =>
      annotateRow(node)
    );
  }

  function annotateRow(row) {
    if (row.dataset.rymAnnotated) return;
    const title =
      row.querySelector(".chartlist-name a")?.textContent ||
      row.querySelector(".chartlist-name span")?.textContent ||
      row.querySelector('[itemprop="name"]')?.textContent ||
      "";
    const artist =
      row.querySelector(".chartlist-artist a")?.textContent ||
      row.querySelector(".chartlist-artist")?.textContent ||
      row.querySelector('[itemprop="byArtist"] a')?.textContent ||
      derivePageArtist();
    const key = keyFor(artist, title);
    if (!key.trim()) return;
    const match = cache.index[key];
    if (!match || !isMatchable(match)) return;
    row.dataset.rymAnnotated = "1";

    const anchor =
      row.querySelector(".chartlist-name") ||
      row.querySelector(".chartlist-name a") ||
      row.querySelector('[itemprop="name"]');
    if (!anchor || anchor.querySelector(".rym-ext-badge")) return;

    const badge = buildBadge(match);
    anchor.appendChild(badge);
  }

  function derivePageArtist() {
    const fromHeader =
      document.querySelector(".header-new-title")?.textContent ||
      document.querySelector(".header-title")?.textContent ||
      "";
    const fromMeta =
      document.querySelector('meta[property="music:musician"]')?.content ||
      document.querySelector('meta[property="og:site_name"]')?.content ||
      "";
    return (fromHeader || fromMeta || "").trim();
  }

  function buildBadge(match) {
    const link = document.createElement(match.url ? "a" : "span");
    link.className = "rym-ext-badge rym-ext-badge-lastfm";
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
        background: #ffeb3b;
        color: #202020;
      }
      .rym-ext-badge-lastfm {
        background: #d92323;
        color: #fff;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function isMatchable(match) {
    return MATCHABLE_TYPES.includes(match.mediaType || "release");
  }
})();
