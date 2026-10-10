// Detects the user's action for the current step. docs/ARCHITECTURE.md section 10.
// Listens in the top page and in every same-origin frame, so a click inside a frame counts too.
(() => {
  const L = globalThis.Lantern;
  const SCROLL_SETTLE_MS = 600;  // nothing highlighted: user scrolled and stopped -> look again
  const OUT_OF_VIEW_MS = 1200;   // the target scrolled away and stayed away -> re-plan
  const FRAME_DEPTH = 3;
  let teardown = null;

  function isOurs(e) {
    return e.composedPath().some((n) => n.tagName === "LANTERN-ROOT");
  }

  /** The top window plus every same-origin frame window. Cross-origin frames just throw. */
  function windows() {
    const out = [window];
    const walk = (win, depth) => {
      if (depth >= FRAME_DEPTH) return;
      for (let i = 0; i < win.frames.length; i++) {
        try {
          const f = win.frames[i];
          if (f.document) { out.push(f); walk(f, depth + 1); }
        } catch {
          // cross-origin: its clicks are not visible to us
        }
      }
    };
    walk(window, 0);
    return out;
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
      let goneSince = 0;
      let scrollTimer = 0;

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

      // Nothing to highlight means Lantern asked the user to scroll (section 6.2). Scrolling is
      // not a click, so without this the turn would never end. Once the scrolling stops we look
      // at the new screen; "page_changed" is the outcome in section 6.1 that fits.
      const onScroll = () => {
        if (target) return;
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => finish("page_changed"), SCROLL_SETTLE_MS);
      };

      const poll = setInterval(() => {
        if (location.href !== url) return finish("page_changed");
        if (!target) return;
        if (!target.isConnected) return finish("page_changed");

        const r = L.viewportRect(target); // top-level coordinates, even inside a frame
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
          coveredSince = 0;
          // Right after a step this is the smooth scrollIntoView; if it lasts, the user has
          // scrolled somewhere else and the old highlight is no longer the right advice.
          if (!goneSince) goneSince = Date.now();
          else if (Date.now() - goneSince > OUT_OF_VIEW_MS) finish("page_changed");
          return;
        }
        goneSince = 0;

        // Hit test in the target's own document, in that document's own coordinates.
        const lr = target.getBoundingClientRect();
        const top = L.hitTest(target.ownerDocument, lr.left + lr.width / 2, lr.top + lr.height / 2);
        const covered = top && !target.contains(top) && !top.contains(target) && top.tagName !== "LANTERN-ROOT";
        if (!covered) coveredSince = 0;
        else if (!coveredSince) coveredSince = Date.now();
        else if (Date.now() - coveredSince > L.config.COVER_MS) finish("target_covered");
      }, 200);

      const wins = windows();
      for (const w of wins) {
        w.addEventListener("click", onClick, true);
        w.addEventListener("change", onChange, true);
        w.addEventListener("scroll", onScroll, true);
      }
      teardown = () => {
        clearInterval(poll);
        clearTimeout(scrollTimer);
        for (const w of wins) {
          try {
            w.removeEventListener("click", onClick, true);
            w.removeEventListener("change", onChange, true);
            w.removeEventListener("scroll", onScroll, true);
          } catch {
            // the frame went away with its page
          }
        }
      };
    },
    disarm() { teardown?.(); teardown = null; },
  };
})();
