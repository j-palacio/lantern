// SUPERSEDED by the React UI in ui/ (built to extension/dist/content.js). Kept only as a
// one-line-manifest-edit rollback for the hackathon; delete once the build is trusted.
// Voice orb visualizer, ChatGPT-voice-mode style. Breathes when idle, follows the user's
// voice (source "user") and Lantern's voice (source "lantern"). Levels arrive ~20/s as
// LANTERN_LEVEL (docs/ARCHITECTURE.md section 12, item 7) - no mic code lives here.
// Plain JS + canvas: layered blurred gradient blobs inside a dark well, additively blended.
(() => {
  const L = globalThis.Lantern;

  // Three colour stops per mode, light -> dark. Used for the blobs and the rim.
  const PALETTES = {
    idle:     ["#ffe3a3", "#ffb703", "#f06000"],
    listening:["#bdf0ff", "#49c6f5", "#2b6ef5"],
    thinking: ["#e8d9ff", "#a98bff", "#5b3fd4"],
    guiding:  ["#fff0c2", "#ffb703", "#ff5d2e"],
    done:     ["#d4f7df", "#4fc97e", "#1d7a4b"],
    error:    ["#ffd0d4", "#ef5560", "#9b1220"],
    user:     ["#bdf0ff", "#49c6f5", "#2b6ef5"],   // while the user is talking
    lantern:  ["#fff0c2", "#ffb703", "#ff5d2e"],   // while Lantern is talking
  };
  const BLOBS = 5;
  const IDLE_AFTER_MS = 450;   // no level for this long -> back to the widget's own state
  const TAU = Math.PI * 2;

  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  let canvas = null, ctx = null, size = 0, dpr = 1;
  let raf = 0, running = false, prev = 0, t = 0;
  let state = "idle";     // whatever the widget is showing
  let source = null;      // "user" | "lantern" while levels keep arriving
  let want = 0, amp = 0, pulse = 0, lastAt = 0;

  function resize() {
    if (!canvas) return;
    size = canvas.clientWidth || Number(canvas.dataset.size) || 112;
    dpr = Math.min(3, devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render() {
    if (!ctx) return;
    const c = PALETTES[source || state] || PALETTES.idle;
    const s = size, cx = s / 2, cy = s / 2;
    const base = s * 0.33;
    const fast = state === "thinking" ? 3.0 : 1.1;
    const breathe = Math.sin(t * fast);
    const r = base * (1 + 0.035 * breathe + 0.16 * amp);

    ctx.clearRect(0, 0, s, s);

    // Soft glow spilling out of the orb, brighter the louder the voice.
    const glow = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.95);
    glow.addColorStop(0, rgba(c[1], 0.30 + 0.35 * amp));
    glow.addColorStop(1, rgba(c[1], 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.95, 0, TAU); ctx.fill();

    // The well, then the blobs inside it.
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip();
    const bg = ctx.createRadialGradient(cx, cy - r * 0.35, r * 0.1, cx, cy, r);
    bg.addColorStop(0, "#1e2432");
    bg.addColorStop(1, "#0a0d13");
    ctx.fillStyle = bg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    ctx.globalCompositeOperation = "lighter";
    ctx.filter = `blur(${(r * 0.26).toFixed(1)}px)`;
    for (let i = 0; i < BLOBS; i++) {
      const ph = i * 2.399;                       // golden angle: evenly spread, never in sync
      const spin = (0.25 + i * 0.11) * (source === "user" ? 1.6 : 1);
      const ang = t * spin + ph;
      const dist = r * (0.10 + 0.30 * amp + 0.06 * Math.sin(t * 0.9 + ph));
      const bx = cx + Math.cos(ang) * dist, by = cy + Math.sin(ang) * dist;
      const br = r * (0.50 + 0.16 * Math.sin(t * 1.3 + ph) + 0.12 * amp);
      const col = c[i % 3];
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, rgba(col, 0.85));
      g.addColorStop(0.6, rgba(col, 0.32));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(bx, by, br, 0, TAU); ctx.fill();
    }
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();

    // Rim, plus a ring that snaps out on peaks so loud speech is obvious.
    ctx.lineWidth = Math.max(1.5, s * 0.012);
    ctx.strokeStyle = rgba(c[0], 0.55);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(c[1], 0.15 + 0.45 * pulse);
    ctx.beginPath(); ctx.arc(cx, cy, r + s * 0.02 + s * 0.055 * pulse, 0, TAU); ctx.stroke();
  }

  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - (prev || now)) / 1000);
    prev = now;
    if (!reduce.matches) t += dt;

    if (source && now - lastAt > IDLE_AFTER_MS) { source = null; want = 0; }
    const k = Math.min(1, (want > amp ? 0.35 : 0.08) * dt * 60);  // fast attack, slow release
    amp += (want - amp) * k;
    pulse = Math.max(pulse * 0.94, amp);
    render();
  }

  L.visualizer = {
    /** @param {HTMLCanvasElement} el canvas inside the widget's shadow root */
    mount(el) { canvas = el; resize(); },

    /** Widget state: idle | listening | thinking | guiding | done | error. */
    setState(next) {
      state = PALETTES[next] ? next : "idle";
      if (running) render();
    },

    /** Called ~20/s from LANTERN_LEVEL. A final 0 arrives when the talker stops. */
    update(src, level) {
      source = src === "user" || src === "lantern" ? src : source;
      want = Math.max(0, Math.min(1, Number(level) || 0));
      lastAt = performance.now();
      this.start();
    },

    start() {
      if (running || !canvas || document.hidden) return;
      if (!ctx || canvas.clientWidth !== size) resize();
      running = true; prev = 0;
      raf = requestAnimationFrame(frame);
    },

    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };

  // Never animate off-screen: content scripts run on every page the user opens.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) L.visualizer.stop();
    else if (canvas?.isConnected && !canvas.closest("[hidden]")) L.visualizer.start();
  });
  addEventListener("resize", () => { if (running) resize(); });
})();
