(function (global) {
  const api = (global.__RYM_EXT__ = global.__RYM_EXT__ || {});

  function createBadgeAwareMutationObserver(badgeClassName, onNonBadgeMutation) {
    const observer = new MutationObserver((mutations) => {
      const onlyBadgeChanges = mutations.every((mutation) => {
        return Array.from(mutation.addedNodes).every((node) => {
          return (
            node.nodeType === 1 &&
            (node.classList?.contains(badgeClassName) || node.querySelector?.(`.${badgeClassName}`))
          );
        });
      });

      if (!onlyBadgeChanges) {
        onNonBadgeMutation();
      }
    });

    return observer;
  }

  function createScanScheduler(scanCallback, options = {}) {
    let scanScheduled = false;
    let needsFullScan = false;
    let scanTimer = null;
    let lastScanAt = 0;
    const cooldownMs = options.cooldown || 0;

    return {
      schedule(full = false) {
        if (full) needsFullScan = true;
        if (scanScheduled || scanTimer) return;

        scanScheduled = true;
        const now = Date.now();
        const wait = Math.max(0, cooldownMs - (now - lastScanAt));

        const execute = () => {
          scanScheduled = false;
          scanTimer = null;
          lastScanAt = Date.now();
          if (needsFullScan) {
            needsFullScan = false;
            scanCallback();
          }
        };

        if (wait > 0) {
          scanTimer = setTimeout(execute, wait);
        } else {
          requestAnimationFrame(execute);
        }
      },
      reset() {
        scanScheduled = false;
        needsFullScan = false;
        if (scanTimer) {
          clearTimeout(scanTimer);
          scanTimer = null;
        }
      },
    };
  }

  api.createBadgeAwareMutationObserver = createBadgeAwareMutationObserver;
  api.createScanScheduler = createScanScheduler;
})(typeof window !== "undefined" ? window : this);
