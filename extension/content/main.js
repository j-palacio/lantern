// Message wiring for the content script. LAST in the manifest list. docs/ARCHITECTURE.md section 6.3.
(() => {
  const L = globalThis.Lantern;
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});
  const nextPaint = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  L.stopGuiding = () => {
    L.watcher.disarm();
    L.overlay.clear();
    L.widget.reset();
  };

  const handlers = {
    async LANTERN_SCAN() {
      L.watcher.disarm();
      L.overlay.clear();
      L.hideUI();
      await nextPaint(); // make sure our UI is gone before the screenshot
      return L.scan();
    },
    LANTERN_SHOW_UI() { L.showUI(); },
    LANTERN_STATUS({ status, text }) { L.widget.status(status, text); },
    LANTERN_STEP({ turn, step }) {
      const el = step.highlight != null ? L.elementById(step.highlight) : null;
      L.overlay.show(el, step.say, step.scam);
      L.widget.status(step.scam?.risk === "high" ? "error" : "guiding", step.say);
      L.watcher.arm(turn, el, (outcome) => send({ type: "LANTERN_STEP_RESULT", turn, outcome }));
    },
    LANTERN_DONE({ say }) {
      L.watcher.disarm();
      L.overlay.clear();
      L.widget.reset();
      L.widget.status("done", say || "You did it!");
    },
  };

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    const h = handlers[msg?.type];
    if (!h) return false;
    Promise.resolve(h(msg)).then(reply, (err) => reply({ error: String(err) }));
    return true;
  });

  // Tell the service worker a page loaded, once the DOM is quiet (500 ms, max 4 s), so a
  // session in this tab resumes on the new page (section 5).
  let quiet;
  const obs = new MutationObserver(() => { clearTimeout(quiet); quiet = setTimeout(hello, 500); });
  const max = setTimeout(hello, 4000);
  let said = false;
  async function hello() {
    if (said) return;
    said = true;
    obs.disconnect(); clearTimeout(quiet); clearTimeout(max);
    const s = await send({ type: "LANTERN_HELLO", url: location.href });
    if (s?.goal) L.widget.guiding(s.goal);
  }
  obs.observe(document.documentElement, { subtree: true, childList: true });
  quiet = setTimeout(hello, 500);
})();
