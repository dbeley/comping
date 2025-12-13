(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  function text(node) {
    if (!node) return "";
    return (node.textContent || "").replace(/\s+/g, " ").trim();
  }

  function texts(nodes) {
    return Array.from(nodes || [])
      .map((n) => text(n))
      .filter(Boolean);
  }

  function toNumber(raw) {
    if (!raw) return "";
    const str = String(raw).trim().toLowerCase();
    const match = str.match(/([\d,.]+)\s*([km])?/);
    if (!match) return "";
    const num = parseFloat(match[1].replace(/,/g, ""));
    if (!isFinite(num)) return "";
    if (match[2] === "k") return Math.round(num * 1000);
    if (match[2] === "m") return Math.round(num * 1_000_000);
    return Math.round(num);
  }

  function pickSrc(img) {
    if (!img) return "";
    return img.getAttribute("src") || img.dataset?.src || img.dataset?.srcset || "";
  }

  function pickBackground(el) {
    if (!el) return "";
    const style = el.getAttribute("style") || "";
    const match = style.match(/url\(['\"]?(.*?)['\"]?\)/);
    return match ? match[1] : "";
  }

  function slugFromUrl(url) {
    if (!url) return "";
    try {
      const u = new URL(url, location.origin);
      return u.pathname.replace(/^\/+/, "");
    } catch {
      return url;
    }
  }

  api.text = text;
  api.texts = texts;
  api.toNumber = toNumber;
  api.pickSrc = pickSrc;
  api.pickBackground = pickBackground;
  api.slugFromUrl = slugFromUrl;
})(typeof window !== "undefined" ? window : this);
