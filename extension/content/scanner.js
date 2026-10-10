// Visible interactive elements -> ElementInfo[]. docs/ARCHITECTURE.md section 7.
// Also looks inside open shadow roots and same-origin iframes, which plain querySelectorAll
// misses: on component-heavy sites those are most of the page.
(() => {
  const L = globalThis.Lantern;

  // Real controls: a match here is always worth an id.
  const STRONG = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea",
    "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]", "[role=checkbox]",
    "[role=radio]", "[role=switch]", "[role=combobox]", "[role=searchbox]", "[role=textbox]",
  ].join(",");
  // Weak: on real sites these are often plain layout <div>s, so they have to earn their id.
  const WEAK = '[onclick],[tabindex]:not([tabindex="-1"])';
  const SELECTOR = `${STRONG},${WEAK}`;
  L.SELECTOR = SELECTOR; // watcher.js uses it to tell "clicked something else" from "clicked nothing"

  const MIN = 2;          // px: ignore slivers and 1x1 tracking pixels
  const SAME = 6;         // px: boxes this close on every edge are the same thing
  const BIG = 0.25;       // a weak candidate covering more of the viewport than this is a wrapper
  const DEPTH = 3;        // how far to follow nested frames
  const PTS = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

  let byId = new Map();

  /**
   * The element's rect in TOP-level viewport pixels. Inside a same-origin iframe
   * getBoundingClientRect is frame-local, so the frame's own offset has to be added or the
   * highlight and the numbered screenshot would both land in the wrong place.
   */
  function viewportRect(el) {
    const r = el.getBoundingClientRect();
    let dx = 0, dy = 0, win = el.ownerDocument?.defaultView;
    for (let i = 0; i < DEPTH && win && win !== window; i++) {
      let frame = null;
      try { frame = win.frameElement; } catch { return r; } // cross-origin: no offset to be had
      if (!frame) break;
      const fr = frame.getBoundingClientRect();
      const cs = frame.ownerDocument.defaultView.getComputedStyle(frame);
      dx += fr.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft);
      dy += fr.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop);
      win = frame.ownerDocument.defaultView;
    }
    return dx || dy ? new DOMRect(r.left + dx, r.top + dy, r.width, r.height) : r;
  }

  /** elementFromPoint that keeps descending into open shadow roots. */
  function hitTest(root, x, y) {
    let el = root.elementFromPoint(x, y);
    for (let i = 0; i < 10 && el?.shadowRoot; i++) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el;
  }

  L.viewportRect = viewportRect;
  L.hitTest = hitTest;

  function isVisible(el) {
    if (el.checkVisibility) {
      // Chrome also catches display:contents, content-visibility and visibility:collapse here.
      return el.checkVisibility({
        checkOpacity: true, opacityProperty: true,
        checkVisibilityCSS: true, visibilityProperty: true,
        contentVisibilityAuto: true,
      });
    }
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0;
  }

  /** Things the user cannot click, and things screen readers are told to ignore. */
  function unavailable(el) {
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    // An open modal usually sets aria-hidden or inert on everything behind it - skip that.
    if (el.closest('[inert],[aria-hidden="true"]')) return true;
    return getComputedStyle(el).pointerEvents === "none";
  }

  /**
   * Would a click at this element's own coordinates reach it? Catches elements hidden under a
   * cookie banner, a sticky header or an open dialog, which is how Lantern used to point at
   * something the user cannot see. Hit testing happens in the element's own document, in
   * frame-local pixels. Lantern's own UI is already hidden during a scan (main.js).
   */
  function reachable(el, win) {
    const r = el.getBoundingClientRect();
    const l = Math.max(0, r.left), t = Math.max(0, r.top);
    const w = Math.min(win.innerWidth, r.right) - l, h = Math.min(win.innerHeight, r.bottom) - t;
    if (w < MIN || h < MIN) return false; // outside its own frame's viewport
    for (const [fx, fy] of PTS) {
      const x = clamp(l + w * fx, 1, win.innerWidth - 2);
      const y = clamp(t + h * fy, 1, win.innerHeight - 2);
      const top = hitTest(el.ownerDocument, x, y);
      if (!top) continue;
      if (top === el || el.contains(top) || top.contains(el)) return true;
      if (top.tagName === "LABEL" && top.control === el) return true; // a label over its input
    }
    return false;
  }

  function labelOf(el) {
    const by = el.getAttribute("aria-labelledby");
    const labelled = by && by.split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.innerText || "").join(" ");
    const t =
      el.getAttribute("aria-label") ||
      (labelled || "").trim() ||
      (el.tagName === "INPUT" && ["submit", "button"].includes(el.type) ? el.value : "") ||
      el.innerText ||
      el.getAttribute("placeholder") ||
      el.getAttribute("title") ||
      el.getAttribute("alt") ||
      el.querySelector?.("img[alt]")?.alt ||
      (el.labels?.[0]?.innerText ?? "") ||
      el.name || "";
    return t.replace(/\s+/g, " ").trim().slice(0, 80);
  }

  function roleOf(el) {
    const role = el.getAttribute("role");
    if (role) return role;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "input") return ["submit", "button", "checkbox", "radio"].includes(el.type) ? el.type : "textbox";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "combobox";
    return tag;
  }

  /** Same clickable thing wrapped twice: <span> in a <button>, <button> in a wrapping <a>. */
  function duplicateOf(kept, el, r) {
    return kept.some(({ el: k, r: kr }) => {
      if (!k.contains(el)) return false;
      const same = Math.abs(kr.left - r.left) < SAME && Math.abs(kr.top - r.top) < SAME &&
                   Math.abs(kr.right - r.right) < SAME && Math.abs(kr.bottom - r.bottom) < SAME;
      const area = r.width * r.height, outer = kr.width * kr.height;
      return same || (outer > 0 && area / outer > 0.85);
    });
  }

  /** One candidate: keep it, with its rect in top-level coordinates, or drop it. */
  function consider(el, win, found) {
    if (el.closest("lantern-root")) return;
    const local = el.getBoundingClientRect();
    if (local.width < MIN || local.height < MIN) return;

    // Must be on screen in the real viewport, not just inside its own frame.
    const r = viewportRect(el);
    const w = Math.min(innerWidth, r.right) - Math.max(0, r.left);
    const h = Math.min(innerHeight, r.bottom) - Math.max(0, r.top);
    if (w < MIN || h < MIN) return;

    if (!isVisible(el) || unavailable(el)) return;

    const text = labelOf(el);
    if (!el.matches(STRONG)) {
      // Weak match: needs a name, a sane size, and no real control inside it.
      if (!text) return;
      if (local.width * local.height > win.innerWidth * win.innerHeight * BIG) return;
      if (el.querySelector(SELECTOR)) return;
    }
    if (duplicateOf(found, el, r)) return;
    if (!reachable(el, win)) return;

    found.push({ el, r, text });
  }

  /** Walk a document or shadow root, then everything nested inside it. */
  function collect(root, win, depth, found) {
    for (const el of root.querySelectorAll(SELECTOR)) consider(el, win, found);

    // querySelectorAll stops at a shadow boundary, so hosts have to be walked by hand.
    for (const host of root.querySelectorAll("*")) {
      if (host.shadowRoot) collect(host.shadowRoot, win, depth, found);
    }

    // Same-origin frames only: a cross-origin one (a Stripe card field, say) throws here and is
    // simply skipped. Nothing is highlighted inside it, which beats a highlight in the wrong place.
    if (depth >= DEPTH) return;
    for (const frame of root.querySelectorAll("iframe")) {
      try {
        const doc = frame.contentDocument;
        if (!doc || !isVisible(frame) || !reachable(frame, win)) continue;
        collect(doc, frame.contentWindow, depth + 1, found);
      } catch {
        // cross-origin: not ours to read
      }
    }
  }

  L.scan = function scan() {
    const found = [];
    collect(document, window, 0, found);

    // Reading order: rows top to bottom (12 px band), left to right inside a row.
    const row = (r) => Math.round(r.top / 12);
    found.sort((a, b) => row(a.r) - row(b.r) || a.r.left - b.r.left);

    byId = new Map();
    const elements = found.slice(0, L.config.MAX_ELEMENTS).map(({ el, r, text }, i) => {
      const id = i + 1;
      byId.set(id, el);
      return {
        id,
        role: roleOf(el),
        text,
        hasValue: "value" in el && el.type !== "submit" && el.type !== "button" ? Boolean(el.value) : false,
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });

    const page = {
      url: location.href,
      title: document.title,
      text: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, L.config.MAX_TEXT),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    };
    return { page, elements };
  };

  L.elementById = (id) => byId.get(id) || null;
})();
