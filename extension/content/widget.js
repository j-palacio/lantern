// Lantern button + panel, inside a closed Shadow DOM (D10). docs/ARCHITECTURE.md section 3.
// TODO(Milestone 3): visual polish and the voice visualizer (Web Audio + canvas).
(() => {
  const L = globalThis.Lantern;
  const C = L.config;

  const host = document.createElement("lantern-root");
  const shadow = host.attachShadow({ mode: "closed" });
  L.shadow = shadow;

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      .launcher {
        position: fixed; right: 24px; bottom: 24px; z-index: 2147483647;
        width: 64px; height: 64px; border-radius: 50%; border: 0; cursor: pointer;
        background: ${C.ACCENT}; box-shadow: 0 6px 20px rgba(0,0,0,.25);
        display: grid; place-items: center;
      }
      .launcher svg { width: 30px; height: 30px; }
      .panel {
        position: fixed; right: 24px; bottom: 100px; z-index: 2147483647; width: 360px;
        background: #fff; color: #1b1b1b; border-radius: 18px; padding: 18px;
        box-shadow: 0 10px 40px rgba(0,0,0,.25); font-size: 18px; line-height: 1.4;
      }
      .panel[hidden] { display: none; }
      .status { margin: 0 0 12px; min-height: 25px; }
      .status.error { color: ${C.DANGER}; }
      .row { display: flex; gap: 8px; }
      input { flex: 1; min-width: 0; font-size: 18px; padding: 10px 12px; border: 2px solid #ccc; border-radius: 12px; }
      button.act { font-size: 18px; padding: 10px 16px; border: 0; border-radius: 12px; cursor: pointer; background: ${C.ACCENT}; }
      button.mic.listening { background: ${C.DANGER}; color: #fff; }
      button.stop { margin-top: 12px; width: 100%; background: #eee; }
      .ring {
        position: fixed; z-index: 2147483646; pointer-events: none; border-radius: 10px;
        border: 4px solid ${C.ACCENT}; box-shadow: 0 0 0 9999px rgba(0,0,0,${C.DIM});
        transition: all .15s ease-out;
      }
      .caption {
        position: fixed; z-index: 2147483647; pointer-events: none; max-width: 400px;
        background: #1b1b1b; color: #fff; font-size: 22px; line-height: 1.35;
        padding: 14px 18px; border-radius: 14px; box-shadow: 0 6px 20px rgba(0,0,0,.3);
      }
      .caption.centered { left: 50% !important; top: 40% !important; transform: translate(-50%, -50%); }
      .caption.danger { background: ${C.DANGER}; font-weight: 600; }
    </style>
    <button class="launcher" aria-label="Ask Lantern for help">
      <svg viewBox="0 0 24 24" fill="none" stroke="#1b1b1b" stroke-width="2" stroke-linecap="round">
        <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8"/>
      </svg>
    </button>
    <div class="panel" hidden>
      <p class="status">What do you want to do? Press the mic and say it, or type it.</p>
      <div class="row">
        <input type="text" placeholder="e.g. pay my electric bill" aria-label="Your goal">
        <button class="act send">Go</button>
      </div>
      <div class="row" style="margin-top:8px">
        <button class="act mic" style="flex:1">🎤 Talk</button>
      </div>
      <button class="act stop" hidden>Stop</button>
    </div>
  `;

  const $ = (s) => shadow.querySelector(s);
  const panel = $(".panel"), statusEl = $(".status"), input = $("input"), mic = $(".mic"), stop = $(".stop");
  const send = (msg) => chrome.runtime.sendMessage(msg).catch(() => {});

  $(".launcher").addEventListener("click", () => { panel.hidden = !panel.hidden; if (!panel.hidden) input.focus(); });
  $(".send").addEventListener("click", startTyped);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") startTyped(); e.stopPropagation(); });
  mic.addEventListener("click", () => send({ type: "LANTERN_VOICE" }));
  stop.addEventListener("click", () => { send({ type: "LANTERN_STOP" }); L.stopGuiding(); });

  function startTyped() {
    const goal = input.value.trim();
    if (!goal) return;
    send({ type: "LANTERN_START", goal, lang: (navigator.language || "en").slice(0, 2) });
    L.widget.guiding(goal);
  }

  L.widget = {
    open() { panel.hidden = false; },
    status(status, text) {
      panel.hidden = false;
      statusEl.textContent = text;
      statusEl.className = `status ${status === "error" ? "error" : ""}`;
      mic.classList.toggle("listening", status === "listening");
      mic.textContent = status === "listening" ? "■ Done talking" : "🎤 Talk";
    },
    guiding(goal) {
      stop.hidden = false;
      this.status("thinking", `Helping you: ${goal}`);
    },
    reset() {
      stop.hidden = true;
      input.value = "";
      this.status("idle", "What do you want to do? Press the mic and say it, or type it.");
    },
  };

  L.hideUI = () => { host.style.display = "none"; };
  L.showUI = () => { host.style.display = ""; };

  document.documentElement.appendChild(host);
})();
