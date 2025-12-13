(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  function createDebugger(namespace, extraMethods = {}) {
    let DEBUG = true;

    const log = (...args) => DEBUG && console.log(`[${namespace}]`, ...args);
    const warn = (...args) => console.warn(`[${namespace}]`, ...args);

    const debugAPI = {
      log,
      warn,
      enableDebug: () => {
        DEBUG = true;
        log("Debug enabled");
      },
      disableDebug: () => {
        DEBUG = false;
        console.log(`[${namespace}] Debug disabled`);
      },
      ...extraMethods,
    };

    return debugAPI;
  }

  api.createDebugger = createDebugger;
})(typeof window !== "undefined" ? window : this);
