// SUPERSEDED by the React UI in ui/ (built to extension/dist/content.js). Kept only as a
// one-line-manifest-edit rollback for the hackathon; delete once the build is trusted.
// Highlight ring, pointing arrow and caption. docs/ARCHITECTURE.md section 9.
// The ring glides to the target instead of jumping, and the caption is placed on the side
// with the most room so it never covers the thing the user has to click.
(() => {
  const L = globalThis.Lantern;
  const PAD = 7;        // ring padding around the element
  const GAP = 26;       // space between the target and the caption (the arrow lives here)
  const EDGE = 12;      // keep this far from the window edges
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");

  // A solid arrowhead pointing down; rotated per side (down 0, left 90, up 180, right 270).
  const ARROW_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 23 L1.5 5 h21 Z"/></svg>';

  let ring = null, caption = null, arrow = null, target = null;
  let raf = 0, cur = null, capSize = null;

  const clampRect = (r) => ({
    l: Math.max(0, r.left), t: Math.max(0, r.top),
    rt: Math.min(innerWidth, r.right), b: Math.min(innerHeight, r.bottom),
  });

  /** Does box a overlap box b (both {l,t,w,h}), with a little slack? */
  function hits(a, b, slack = 8) {
    return a.l < b.rt + slack && a.l + a.w > b.l - slack &&
           a.t < b.b + slack && a.t + a.h > b.t - slack;
  }

  /** Caption position for one side of the target, or null if it does not fit. */
  function candidate(side, box, w, h) {
    const cx = (box.l + box.rt) / 2, cy = (box.t + box.b) / 2;
    let l, t;
    if (side === "below")      { l = cx - w / 2;      t = box.b + GAP; }
    else if (side === "above") { l = cx - w / 2;      t = box.t - GAP - h; }
    else if (side === "right") { l = box.rt + GAP;    t = cy - h / 2; }
    else                       { l = box.l - GAP - w; t = cy - h / 2; }

    // Slide along the free axis to stay on screen, then reject if it still does not fit.
    if (side === "below" || side === "above") l = Math.max(EDGE, Math.min(l, innerWidth - w - EDGE));
    else t = Math.max(EDGE, Math.min(t, innerHeight - h - EDGE));
    if (l < EDGE || t < EDGE || l + w > innerWidth - EDGE || t + h > innerHeight - EDGE) return null;
    const pos = { l, t, w, h };
    return hits(pos, box) ? null : pos;
  }

  function place() {
    if (!target || !ring) return;
    // viewportRect, not getBoundingClientRect: a target inside a same-origin iframe reports
    // frame-local coordinates, and the ring lives in the top-level page.
    const r = L.viewportRect(target);
    const want = { l: r.left - PAD, t: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };

    // Glide: the ring catches up over a few frames so the eye can follow it.
    if (!cur || reduce.matches) cur = { ...want };
    else for (const k of ["l", "t", "w", "h"]) cur[k] += (want[k] - cur[k]) * 0.28;
    if (Math.abs(cur.l - want.l) + Math.abs(cur.t - want.t) +
        Math.abs(cur.w - want.w) + Math.abs(cur.h - want.h) < 0.6) cur = { ...want };

    ring.style.left = `${Math.round(cur.l)}px`;
    ring.style.top = `${Math.round(cur.t)}px`;
    ring.style.width = `${Math.round(cur.w)}px`;
    ring.style.height = `${Math.round(cur.h)}px`;

    // Caption + arrow follow the real rect, not the gliding one, so they settle first.
    const box = clampRect(r);
    const onScreen = box.rt > box.l && box.b > box.t;
    if (caption) {
      if (!capSize) capSize = { w: caption.offsetWidth, h: caption.offsetHeight };
      const { w, h } = capSize;
      const room = { below: innerHeight - box.b, above: box.t, right: innerWidth - box.rt, left: box.l };
      const order = ["below", "above", "right", "left"].sort((a, b) => room[b] - room[a]);
      let pos = null, side = "below";
      for (const s of order) { pos = candidate(s, box, w, h); if (pos) { side = s; break; } }
      if (!pos || !onScreen) {
        // Nothing fits (tiny window, or the target is off-screen): park it away from the target.
        const top = box.t > innerHeight / 2;
        pos = { l: Math.max(EDGE, (innerWidth - w) / 2), t: top ? EDGE : innerHeight - h - EDGE, w, h };
        side = top ? "below" : "above";
      }
      caption.style.left = `${Math.round(pos.l)}px`;
      caption.style.top = `${Math.round(pos.t)}px`;
      placeArrow(box, pos, side, onScreen);
    }
    raf = requestAnimationFrame(place);
  }

  /** The arrow sits in the gap between the caption and the target, pointing at the target. */
  function placeArrow(box, pos, side, onScreen) {
    if (!arrow) return;
    arrow.hidden = !onScreen;
    if (!onScreen) return;
    const size = 48, half = size / 2;
    const toward = { below: "above", above: "below", right: "left", left: "right" }[side];
    const deg = { above: 180, below: 0, left: 90, right: 270 }[toward]; // the glyph points down at 0
    let l, t;
    if (toward === "above")      { l = pos.l + pos.w / 2 - half; t = (box.b + pos.t) / 2 - half; }
    else if (toward === "below") { l = pos.l + pos.w / 2 - half; t = (pos.t + pos.h + box.t) / 2 - half; }
    else if (toward === "left")  { l = (box.rt + pos.l) / 2 - half; t = pos.t + pos.h / 2 - half; }
    else                         { l = (pos.l + pos.w + box.l) / 2 - half; t = pos.t + pos.h / 2 - half; }
    arrow.className = `arrow ${toward === "above" || toward === "below" ? "bob-y" : "bob-x"}`;
    arrow.style.rotate = `${deg}deg`;
    arrow.style.left = `${Math.round(Math.max(EDGE, Math.min(l, innerWidth - size - EDGE)))}px`;
    arrow.style.top = `${Math.round(Math.max(EDGE, Math.min(t, innerHeight - size - EDGE)))}px`;
  }

  L.overlay = {
    /** @param {Element|null} el @param {string} say @param {{risk:string,reason:string}} [scam] */
    show(el, say, scam) {
      this.clear();
      const danger = scam?.risk === "high";

      caption = document.createElement("div");
      caption.className = `caption${danger ? " danger" : ""}`;
      caption.textContent = say || "";
      if (danger && scam.reason) {
        const warn = document.createElement("span");
        warn.className = "warn";
        warn.textContent = scam.reason;
        caption.appendChild(warn);
      }
      L.shadow.appendChild(caption);

      // On a high scam risk we never point at a pay button (section 6.2).
      if (!el || danger) {
        caption.classList.add("centered");
        return;
      }

      target = el;
      ring = document.createElement("div");
      ring.className = "ring";
      arrow = document.createElement("div");
      arrow.className = "arrow";
      arrow.innerHTML = ARROW_SVG;
      L.shadow.append(ring, arrow);

      const r = L.viewportRect(el);
      if (r.top < 80 || r.bottom > innerHeight - 80) {
        el.scrollIntoView({ block: "center", behavior: reduce.matches ? "auto" : "smooth" });
      }
      place();
    },

    clear() {
      cancelAnimationFrame(raf);
      raf = 0;
      ring?.remove(); caption?.remove(); arrow?.remove();
      ring = caption = arrow = target = cur = capSize = null;
    },
  };

  // The caption's size changes with the window, so re-measure it once things stop moving.
  addEventListener("resize", () => { capSize = null; });
})();
