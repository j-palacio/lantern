// SUPERSEDED by the React UI in ui/ (built to extension/dist/content.js). Kept only as a
// one-line-manifest-edit rollback for the hackathon; delete once the build is trusted.
// Lantern button + panel, inside a closed Shadow DOM (D10). docs/ARCHITECTURE.md section 3.
// Also holds the styles for the overlay (ring, arrow, caption), which share this shadow root.
(() => {
  const L = globalThis.Lantern;
  const C = L.config;

  // One row per widget state. docs/MILESTONES.md Milestone 3.
  const STATES = {
    idle:      { chip: "Ready",     hint: "What do you want to do? Press Talk and say it, or type it." },
    listening: { chip: "Listening", hint: "Listening... press again when you're done." },
    thinking:  { chip: "Looking",   hint: "Looking at this page..." },
    guiding:   { chip: "Guiding",   hint: "" },
    done:      { chip: "Done",      hint: "You did it!" },
    error:     { chip: "Problem",   hint: "" },
  };

  const host = document.createElement("lantern-root");
  const shadow = host.attachShadow({ mode: "closed" });
  L.shadow = shadow;

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * {
        box-sizing: border-box;
        /* Atkinson Hyperlegible when the user has it installed - the most legible of these. */
        font-family: "Atkinson Hyperlegible Next", "Atkinson Hyperlegible", system-ui, -apple-system, "Segoe UI", sans-serif;
      }
      button:focus-visible, input:focus-visible { outline: 3px solid #1b63d6; outline-offset: 2px; }

      /* ---------- launcher ---------- */
      .launcher {
        position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;
        width: 64px; height: 64px; border-radius: 50%; border: 0; cursor: pointer;
        background: ${C.ACCENT}; box-shadow: 0 6px 20px rgba(0,0,0,.28);
        display: grid; place-items: center; transition: transform .15s ease-out;
      }
      .launcher:hover { transform: scale(1.06); }
      .launcher svg { width: 30px; height: 30px; }
      .launcher.active::after {
        content: ""; position: absolute; inset: -6px; border-radius: 50%;
        border: 3px solid ${C.ACCENT}; animation: halo 1.8s ease-out infinite;
      }
      @keyframes halo { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.35); } }

      /* ---------- panel ---------- */
      .panel {
        position: fixed; right: 24px; bottom: 100px; z-index: 2147483647;
        width: min(380px, calc(100vw - 32px));
        background: #fff; color: #14161a; border: 1px solid #e3e6ea; border-radius: 20px;
        padding: 18px; box-shadow: 0 18px 50px rgba(0,0,0,.28);
        font-size: 19px; line-height: 1.45;
      }
      .panel[hidden] { display: none; }
      .head { display: flex; align-items: center; gap: 14px; }
      canvas.orb { width: 92px; height: 92px; flex: 0 0 auto; display: block; }
      .brand { font-size: 21px; font-weight: 700; letter-spacing: .2px; }
      .chip {
        display: inline-flex; align-items: center; gap: 7px; margin-top: 4px;
        font-size: 15px; font-weight: 600; color: #3a4049;
        background: #f1f3f6; border-radius: 999px; padding: 4px 11px;
      }
      .chip i { width: 9px; height: 9px; border-radius: 50%; background: #9aa2ad; }
      .panel.listening .chip i { background: #2b6ef5; animation: blink 1s steps(2) infinite; }
      .panel.thinking  .chip i { background: #a98bff; animation: blink .7s steps(2) infinite; }
      .panel.guiding   .chip i { background: ${C.ACCENT}; }
      .panel.done      .chip i { background: #2d9b5f; }
      .panel.error     .chip i { background: ${C.DANGER}; }
      @keyframes blink { 50% { opacity: .25; } }

      .status { margin: 14px 0 12px; min-height: 28px; font-size: 19px; }
      .panel.error .status { color: ${C.DANGER}; font-weight: 600; }
      .panel.done .status { color: #1d7a4b; font-weight: 600; }

      .row { display: flex; gap: 8px; }
      .row + .row { margin-top: 8px; }
      input {
        flex: 1; min-width: 0; font-size: 19px; padding: 11px 13px;
        border: 2px solid #c6cbd2; border-radius: 12px; color: inherit; background: #fff;
      }
      input::placeholder { color: #767d87; }
      button.act {
        font-size: 19px; font-weight: 600; padding: 11px 16px; border: 0; border-radius: 12px;
        cursor: pointer; background: ${C.ACCENT}; color: #14161a;
      }
      button.act:hover { filter: brightness(1.06); }
      button.mic { flex: 1; }
      .panel.listening button.mic { background: ${C.DANGER}; color: #fff; }
      button.stop { width: 100%; margin-top: 10px; background: #eceef1; color: #14161a; }

      /* ---------- overlay (section 9) ---------- */
      .ring {
        position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 12px;
        border: 5px solid ${C.ACCENT};
        box-shadow: 0 0 0 9999px rgba(0,0,0,${C.DIM}), 0 0 22px 4px ${C.ACCENT};
      }
      .ring::after {
        content: ""; position: absolute; inset: -9px; border-radius: 16px;
        border: 4px solid ${C.ACCENT}; animation: pulse 1.6s ease-out infinite;
      }
      @keyframes pulse { 0% { opacity: .85; transform: scale(.97); } 100% { opacity: 0; transform: scale(1.12); } }

      .arrow {
        position: fixed; z-index: 2147483647; pointer-events: none;
        width: 48px; height: 48px; color: ${C.ACCENT};
        filter: drop-shadow(0 3px 6px rgba(0,0,0,.45));
      }
      .arrow svg { width: 100%; height: 100%; display: block; }
      .arrow.bob-x { animation: bobx 1s ease-in-out infinite alternate; }
      .arrow.bob-y { animation: boby 1s ease-in-out infinite alternate; }
      @keyframes bobx { from { translate: -5px 0; } to { translate: 5px 0; } }
      @keyframes boby { from { translate: 0 -5px; } to { translate: 0 5px; } }

      .caption {
        position: fixed; z-index: 2147483647; pointer-events: none;
        width: max-content; max-width: min(460px, calc(100vw - 32px));
        background: #14161a; color: #fff; font-size: 23px; font-weight: 600; line-height: 1.35;
        padding: 15px 19px; border-radius: 16px; box-shadow: 0 8px 26px rgba(0,0,0,.4);
      }
      .caption.centered { left: 50% !important; top: 40% !important; transform: translate(-50%, -50%); }
      .caption.danger { background: ${C.DANGER}; }
      .caption .warn { display: block; font-size: 18px; font-weight: 500; margin-top: 7px; opacity: .95; }
      @media (prefers-reduced-motion: reduce) {
        .ring::after, .arrow, .launcher.active::after, .chip i { animation: none; }
      }
    </style>
    <button class="launcher" aria-label="Ask Lantern for help">
      <svg viewBox="0 0 24 24" fill="none" stroke="#1b1b1b" stroke-width="2" stroke-linecap="round">
        <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>
      </svg>
    </button>
    <div class="panel" hidden role="dialog" aria-label="Lantern">
      <div class="head">
        <canvas class="orb" data-size="92" aria-hidden="true"></canvas>
        <div>
          <div class="brand">Lantern</div>
          <div class="chip"><i></i><span class="chip-text">Ready</span></div>
        </div>
      </div>
      <p class="status" role="status" aria-live="polite">${STATES.idle.hint}</p>
      <div class="row">
        <input type="text" placeholder="e.g. pay my electric bill" aria-label="Your goal">
        <button class="act send">Go</button>
      </div>
      <div class="row">
        <button class="act mic" aria-label="Talk to Lantern">&#127908; Talk</button>
      </div>
      <button class="act stop">Stop</button>
    </div>
  `;

  const $ = (s) => shadow.querySelector(s);
  const launcher = $(".launcher"), panel = $(".panel"), statusEl = $(".status");
  const chipText = $(".chip-text"), input = $("input"), mic = $(".mic"), stop = $(".stop");
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

  function openPanel(open) {
    panel.hidden = !open;
    if (open) {
      L.visualizer?.start();
      input.focus({ preventScroll: true });
    } else {
      L.visualizer?.stop();
    }
  }

  launcher.addEventListener("click", () => openPanel(panel.hidden));
  $(".send").addEventListener("click", startTyped);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startTyped();
    if (e.key === "Escape") openPanel(false);
    e.stopPropagation(); // the page's own shortcuts never see what the user types here
  });
  mic.addEventListener("click", () => send({ type: "LANTERN_VOICE" }));
  // Stop works in every state, and clears our own UI even if the service worker is gone.
  stop.addEventListener("click", () => {
    send({ type: "LANTERN_STOP" });
    L.stopGuiding?.();
    L.widget.reset();
  });

  function startTyped() {
    const goal = input.value.trim();
    if (!goal) return;
    send({ type: "LANTERN_START", goal, lang: (navigator.language || "en").slice(0, 2) });
    L.widget.guiding(goal);
  }

  L.widget = {
    open() { openPanel(true); },

    /** status: idle | listening | thinking | guiding | done | error (section 6.3). */
    status(status, text) {
      const name = STATES[status] ? status : "idle";
      openPanel(true);
      panel.className = `panel ${name}`;
      chipText.textContent = STATES[name].chip;
      statusEl.textContent = text || STATES[name].hint;
      launcher.classList.toggle("active", ["listening", "thinking", "guiding"].includes(name));
      mic.innerHTML = name === "listening" ? "&#9632; Done talking" : "&#127908; Talk";
      mic.setAttribute("aria-label", name === "listening" ? "Stop talking" : "Talk to Lantern");
      L.visualizer?.setState(name);
    },

    guiding(goal) { this.status("thinking", `Helping you: ${goal}`); },

    reset() {
      input.value = "";
      this.status("idle");
    },
  };

  L.hideUI = () => { host.style.display = "none"; };
  L.showUI = () => { host.style.display = ""; };

  document.documentElement.appendChild(host);
  L.visualizer?.mount($("canvas.orb"));
})();
