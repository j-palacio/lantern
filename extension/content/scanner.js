// Visible interactive elements -> ElementInfo[]. docs/ARCHITECTURE.md section 7.
(() => {
  const L = globalThis.Lantern;
  const SELECTOR = [
    "a[href]", "button", "input:not([type=hidden])", "select", "textarea",
    "[role=button]", "[role=link]", "[role=tab]", "[role=menuitem]", "[role=checkbox]",
    "[onclick]", '[tabindex]:not([tabindex="-1"])',
  ].join(",");
  L.SELECTOR = SELECTOR;

  let byId = new Map();

  function isVisible(el, r) {
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.right < 0 || r.top > innerHeight || r.left > innerWidth) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0;
  }

  function labelOf(el) {
    const t =
      el.getAttribute("aria-label") ||
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

  L.scan = function scan() {
    const found = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (el.closest("lantern-root")) continue;
      const r = el.getBoundingClientRect();
      if (!isVisible(el, r)) continue;
      // Skip an element nested inside another candidate with the same box (e.g. <span> in <button>).
      if (found.some((f) => f.el.contains(el) && Math.abs(f.r.width - r.width) < 4)) continue;
      found.push({ el, r });
    }
    found.sort((a, b) => (Math.abs(a.r.top - b.r.top) > 8 ? a.r.top - b.r.top : a.r.left - b.r.left));

    byId = new Map();
    const elements = found.slice(0, L.config.MAX_ELEMENTS).map(({ el, r }, i) => {
      const id = i + 1;
      byId.set(id, el);
      return {
        id,
        role: roleOf(el),
        text: labelOf(el),
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
