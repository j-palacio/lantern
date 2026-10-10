import { Component, StrictMode, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import css from "./index.css?inline";
import { Overlay } from "./Overlay";
import { Widget } from "./Widget";
import { actions, clearLevel, getState, pushLevel, subscribe, type Scam } from "./store";

// Lantern's whole in-page UI, mounted in a closed shadow root so page CSS cannot break it and
// ours cannot leak out (docs/ARCHITECTURE.md D10). content/main.js drives this through the
// same L.widget / L.overlay / L.visualizer API the plain-JS version exposed.

interface LanternGlobal {
  config?: { ACCENT?: string; DANGER?: string; DIM?: number };
  shadow?: ShadowRoot;
  widget?: unknown;
  overlay?: unknown;
  visualizer?: unknown;
  hideUI?: () => void;
  showUI?: () => void;
}

const L: LanternGlobal = ((globalThis as { Lantern?: LanternGlobal }).Lantern ??= {});

const host = document.createElement("lantern-root");
const shadow = host.attachShadow({ mode: "closed" });
L.shadow = shadow;

const style = document.createElement("style");
style.textContent = css;
shadow.appendChild(style);

const mount = document.createElement("div");
mount.className = "lantern";
// config.js stays the single source of truth for the accent colours.
mount.style.setProperty("--l-accent", L.config?.ACCENT ?? "#ffb703");
mount.style.setProperty("--l-danger", L.config?.DANGER ?? "#ff6b6e");
mount.style.setProperty("--l-dim", String(L.config?.DIM ?? 0.45));
shadow.appendChild(mount);

document.documentElement.appendChild(host);

/**
 * We render inside whatever page the user opened, so one bad DOM call must not take the UI
 * down with it. Overlay and Widget get their own shield: if the highlight fails, the user can
 * still hear the step and press Stop.
 */
class Shield extends Component<{ children: ReactNode; name: string }, { dead: boolean }> {
  state = { dead: false };
  static getDerivedStateFromError() {
    return { dead: true };
  }
  componentDidCatch(error: unknown) {
    console.warn(`[Lantern] ${this.props.name} failed:`, error);
  }
  render() {
    return this.state.dead ? null : this.props.children;
  }
}

function App() {
  const state = useSyncExternalStore(subscribe, getState);
  return (
    <>
      <Shield name="overlay">
        <Overlay step={state.step} />
      </Shield>
      <Shield name="widget">
        <Widget state={state} />
      </Shield>
    </>
  );
}

createRoot(mount).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ---- the API content/main.js calls (section 6.3) ----

L.widget = {
  open: () => actions.open(true),
  status: (status: string, text?: string, turn?: number) => actions.status(status, text, turn),
  guiding: (goal: string, heard?: "voice" | "typed") => actions.guiding(goal, heard ?? null),
  reset: () => actions.reset(),
};

L.overlay = {
  show: (el: Element | null, say: string, scam?: Scam) => actions.showStep(el, say || "", scam),
  clear: () => actions.clearStep(),
};

L.visualizer = {
  update: (source: string, level: number) => pushLevel(source, level),
  // Kept so anything written against the plain-JS visualizer keeps working.
  setState: () => {},
  mount: () => {},
  start: () => {},
  stop: () => clearLevel(),
};

// Hiding has to be instant and synchronous: main.js hides the UI, waits two frames and then
// the service worker screenshots the tab, so React's render queue cannot be in the way.
L.hideUI = () => {
  host.style.display = "none";
};
L.showUI = () => {
  host.style.display = "";
};
