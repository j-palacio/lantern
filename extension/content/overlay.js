// Highlight ring + caption. docs/ARCHITECTURE.md section 9.
// TODO(Milestone 3): polish the look (animation, big arrow/cursor, caption placement on small screens).
(() => {
  const L = globalThis.Lantern;
  let ring = null, caption = null, target = null, raf = 0;

  function place() {
    if (!target || !ring) return;
    const r = target.getBoundingClientRect();
    const pad = 6;
    Object.assign(ring.style, {
      left: `${r.left - pad}px`, top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px`,
    });
    const below = r.bottom + 16 + 80 < innerHeight;
    caption.style.left = `${Math.max(12, Math.min(r.left, innerWidth - 420))}px`;
    caption.style.top = below ? `${r.bottom + 16}px` : `${Math.max(12, r.top - 96)}px`;
    raf = requestAnimationFrame(place);
  }

  L.overlay = {
    show(el, say, scam) {
      this.clear();
      const danger = scam?.risk === "high";
      caption = document.createElement("div");
      caption.className = `caption${danger ? " danger" : ""}`;
      caption.textContent = danger && scam.reason ? `${say} ${scam.reason}` : say;
      L.shadow.appendChild(caption);

      if (el && !danger) {
        target = el;
        ring = document.createElement("div");
        ring.className = "ring";
        L.shadow.appendChild(ring);
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        place();
      } else {
        caption.classList.add("centered"); // no target (scroll, warning): center the caption
      }
    },
    clear() {
      cancelAnimationFrame(raf);
      ring?.remove(); caption?.remove();
      ring = caption = target = null;
    },
  };
})();
