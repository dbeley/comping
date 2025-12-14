// Cross-browser compatibility: Firefox uses 'browser', Chrome uses 'chrome'
const browser = globalThis.browser || globalThis.chrome;

// Helper to ensure sendMessage always returns a Promise (Chrome MV2 uses callbacks)
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    browser.runtime.sendMessage(message, (response) => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

const api = window.__RYM_EXT__ || {};
const SOURCES = api.SOURCES || {};
const TARGETS = api.TARGETS || {};
const DEFAULT_SETTINGS = api.DEFAULT_SETTINGS || { sources: {}, overlays: {} };
let settings = DEFAULT_SETTINGS;

document.addEventListener("DOMContentLoaded", () => {
  renderAll();
  document.getElementById("refresh").addEventListener("click", renderAll);
  document.getElementById("export").addEventListener("click", exportCsv);
  initCollapsibleSections();
});

async function renderAll() {
  const status = document.getElementById("status");
  status.textContent = "Loading…";
  clearMessage();
  try {
    const [loadedSettings, cache] = await Promise.all([
      sendMessage({ type: "rym-settings-get" }).catch(() => DEFAULT_SETTINGS),
      sendMessage({ type: "rym-cache-request" }).catch(() => null),
    ]);
    settings = { ...DEFAULT_SETTINGS, ...loadedSettings };
    renderStatus(cache);
    renderToggles();
  } catch (err) {
    status.textContent = `Error loading cache: ${err.message || err}`;
  }
}

function renderStatus(cache) {
  const status = document.getElementById("status");
  if (!cache) {
    status.textContent = "No cache found yet. Open RYM/Glitchwave pages to sync.";
    return;
  }
  const count = cache.entries?.length || Object.keys(cache.index || {}).length || 0;
  const lastSync = cache.lastSync ? new Date(cache.lastSync).toLocaleString() : "unknown";
  const byType = summarize(cache.entries || []);
  const summary = Object.entries(byType)
    .map(([type, total]) => `${type}: ${total}`)
    .join("\n");
  status.textContent = `Cached items: ${count}${summary ? `\n${summary}` : ""}\nLast sync: ${lastSync}`;
}

function renderToggles() {
  const sourceWrap = document.getElementById("sources");
  const overlayWrap = document.getElementById("overlays");
  sourceWrap.innerHTML = "";
  overlayWrap.innerHTML = "";

  Object.values(SOURCES).forEach((src) => {
    const row = buildToggleRow(src.label, settings.sources?.[src.mediaType] !== false, (checked) =>
      updateSettings({ sources: { [src.mediaType]: checked } })
    );
    sourceWrap.appendChild(row);
  });

  // Group overlays by media type
  const targetsByType = Object.values(TARGETS).reduce((acc, tgt) => {
    const type = tgt.mediaType || "other";
    if (!acc[type]) acc[type] = [];
    acc[type].push(tgt);
    return acc;
  }, {});

  const typeLabels = {
    music: "Music streaming",
    game: "Video games",
    film: "Movies",
    other: "Other",
  };

  Object.entries(targetsByType).forEach(([type, targets]) => {
    if (targets.length === 0) return;

    const heading = document.createElement("div");
    heading.textContent = typeLabels[type] || type;
    heading.style.fontWeight = "600";
    heading.style.fontSize = "11px";
    heading.style.marginTop = "8px";
    heading.style.marginBottom = "4px";
    heading.style.color = "#666";
    overlayWrap.appendChild(heading);

    targets.forEach((tgt) => {
      const row = buildToggleRow(tgt.label, settings.overlays?.[tgt.id] !== false, (checked) =>
        updateSettings({ overlays: { [tgt.id]: checked } })
      );
      overlayWrap.appendChild(row);
    });
  });
}

function buildToggleRow(label, checked, onChange) {
  const wrapper = document.createElement("label");
  wrapper.className = "toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const text = document.createElement("span");
  text.textContent = label;
  wrapper.appendChild(input);
  wrapper.appendChild(text);
  return wrapper;
}

async function updateSettings(partial) {
  clearMessage();
  try {
    settings = await sendMessage({
      type: "rym-settings-set",
      settings: partial,
    });
    showMessage("Saved preferences");
  } catch (err) {
    showMessage(`Unable to save: ${err.message || err}`, true);
  }
}

async function exportCsv() {
  clearMessage();
  try {
    const result = await sendMessage({ type: "rym-cache-export" });
    if (!result?.csv) {
      showMessage("Nothing to export yet.");
      return;
    }
    const blob = new Blob([result.csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rym-cache-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage(`Exported ${result.count || 0} rows.`);
  } catch (err) {
    showMessage(`Export failed: ${err.message || err}`, true);
  }
}

function summarize(entries) {
  const summary = {};
  for (const entry of entries) {
    const key = entry.mediaType || "unknown";
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

function showMessage(text, isError = false) {
  const node = document.getElementById("message");
  node.textContent = text;
  node.style.color = isError ? "#b00020" : "#111";
}

function clearMessage() {
  showMessage("");
}

function initCollapsibleSections() {
  const sections = document.querySelectorAll(".section");
  sections.forEach((section) => {
    const header = section.querySelector("h2");
    const sectionName = section.dataset.section;

    // Restore collapsed state from localStorage
    const isCollapsed = localStorage.getItem(`section-${sectionName}-collapsed`) === "true";
    if (isCollapsed) {
      section.classList.add("collapsed");
    }

    header.addEventListener("click", () => {
      section.classList.toggle("collapsed");
      // Save state to localStorage
      localStorage.setItem(
        `section-${sectionName}-collapsed`,
        section.classList.contains("collapsed")
      );
    });
  });
}
