(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  // Global debug flag for all overlays
  let DEBUG = true;

  function createDebugger(namespace, extraMethods = {}) {
    const log = (...args) => DEBUG && console.log(`[${namespace}]`, ...args);
    const warn = (...args) => console.warn(`[${namespace}]`, ...args);

    const debugAPI = {
      log,
      warn,
      ...extraMethods,
    };

    return debugAPI;
  }

  // Global debug control
  api.debug = {
    enabled: () => DEBUG,
    enable: () => {
      DEBUG = true;
      console.log("[rym-ext] Debug enabled for all overlays");
    },
    disable: () => {
      DEBUG = false;
      console.log("[rym-ext] Debug disabled for all overlays");
    },
  };

  api.createDebugger = createDebugger;
})(typeof window !== "undefined" ? window : this);
