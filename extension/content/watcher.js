// Detects the user's action for the current step. docs/ARCHITECTURE.md section 10.
(() => {
  const L = globalThis.Lantern;
  let teardown = null;

  function isOurs(e) {
    return e.composedPath().some((n) => n.tagName === "LANTERN-ROOT");
  }

  function waitForSettle() {
    return new Promise((resolve) => {
      let quiet;
      const obs = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(done, L.config.SETTLE_QUIET_MS); });
      const max = setTimeout(done, L.config.SETTLE_MAX_MS);
      function done() { obs.disconnect(); clearTimeout(quiet); clearTimeout(max); resolve(); }
      obs.observe(document.body, { subtree: true, childList: true, attributes: true });
      quiet = setTimeout(done, L.config.SETTLE_QUIET_MS);
    });
  }

  /** @param {number} turn @param {Element|null} target @param {(outcome: string) => void} report */
  L.watcher = {
    arm(turn, target, report) {
      this.disarm();
      const url = location.href;
      let reported = false;
      let coveredSince = 0;

      const finish = async (outcome) => {
        if (reported) return;
        reported = true;
        this.disarm();
        L.overlay.clear();
        report(outcome);
        // A full page load replaces this script and the new page sends HELLO; a single-page-app
        // URL change does not, so we always send READY once the DOM settles.
        await waitForSettle();
        chrome.runtime.sendMessage({ type: "LANTERN_READY", turn: turn + 1 });
      };

      const onClick = (e) => {
        if (isOurs(e)) return;
        if (target && target.contains(e.target)) return finish("completed");
        if (e.target.closest?.(L.SELECTOR)) finish("clicked_elsewhere");
      };
      const onChange = (e) => { if (target && target.contains(e.target)) finish("completed"); };

      const poll = setInterval(() => {
        if (location.href !== url) return finish("page_changed");
        if (!target) return;
        if (!target.isConnected) return finish("page_changed");
        const r = target.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) { coveredSince = 0; return; } // still scrolling into view
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const covered = top && !target.contains(top) && !top.contains(target) && top.tagName !== "LANTERN-ROOT";
        if (!covered) coveredSince = 0;
        else if (!coveredSince) coveredSince = Date.now();
        else if (Date.now() - coveredSince > L.config.COVER_MS) finish("target_covered");
      }, 200);

      window.addEventListener("click", onClick, true);
      window.addEventListener("change", onChange, true);
      teardown = () => {
        clearInterval(poll);
        window.removeEventListener("click", onClick, true);
        window.removeEventListener("change", onChange, true);
      };
    },
    disarm() { teardown?.(); teardown = null; },
  };
})();
