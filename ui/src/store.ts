// The bridge between Lantern's plain-JS content scripts and this React UI.
// content/main.js calls L.widget.* / L.overlay.* / L.visualizer.* exactly as before
// (docs/ARCHITECTURE.md section 6.3); those calls land here and the UI re-renders.

export type Status = "idle" | "listening" | "thinking" | "guiding" | "done" | "error";
export type Risk = "low" | "medium" | "high";
export interface Scam {
  risk: Risk;
  reason?: string;
}

export interface Step {
  say: string;
  scam?: Scam;
  target: Element | null;
}

export interface State {
  open: boolean; // the launcher has been opened
  arming: boolean; // the mic was pressed; waiting for the recorder to actually start
  status: Status;
  text: string; // the instruction, or the status line
  goal: string | null; // what Lantern understood the user wants
  heard: "voice" | "typed" | null; // how that goal arrived
  turn: number | null; // which step of that task we are on
  lang: string; // language for typed goals; spoken goals detect their own (D4)
  step: Step | null; // what the overlay draws, null when nothing is highlighted
}

export const CHIPS: Record<Status, string> = {
  idle: "Ready to help",
  listening: "Listening",
  thinking: "Reading the page",
  guiding: "Guiding you",
  done: "Finished",
  error: "Something went wrong",
};

export const LANGS: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "zh", label: "中文" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ht", label: "Kreyòl" },
  // "tl" is what the rest of Lantern uses: server/voice.js maps ElevenLabs' tgl and fil onto it,
  // so a spoken Filipino goal and a typed one land on the same code.
  { code: "tl", label: "Filipino" },
];

const browserLang = (navigator.language || "en").slice(0, 2).toLowerCase();
const LANG_KEY = "lantern.lang";

let state: State = {
  open: false,
  arming: false,
  status: "idle",
  text: "",
  goal: null,
  heard: null,
  turn: null,
  lang: LANGS.some((l) => l.code === browserLang) ? browserLang : "en",
  step: null,
};

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function getState(): State {
  return state;
}

function set(patch: Partial<State>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const isStatus = (s: string): s is Status => s in CHIPS;

// The chosen language lives in extension storage, not the page's: it is Lantern's setting,
// not something the site should be able to see or keep.
chrome.storage?.local?.get(LANG_KEY).then((got) => {
  const saved = got?.[LANG_KEY];
  if (typeof saved === "string" && LANGS.some((l) => l.code === saved)) set({ lang: saved });
}, () => {});

export const actions = {
  open(open = true) {
    set({ open });
  },

  /**
   * status: idle | listening | thinking | guiding | done | error (section 6.3).
   * `turn` is passed through from LANTERN_STEP so the panel can say which step this is.
   */
  status(status: string, text?: string, turn?: number) {
    const next = isStatus(status) ? status : "idle";
    set({
      open: true,
      arming: false, // whatever the service worker says, the wait is over
      status: next,
      text: text || "",
      turn: typeof turn === "number" ? turn : state.turn,
    });
  },

  /** The mic was pressed. The recorder takes a moment to come up; say so instead of flashing. */
  arm() {
    set({ open: true, arming: true });
  },

  /** A goal started, or a session resumed on a new page: this is what Lantern understood. */
  guiding(goal: string, heard: "voice" | "typed" | null = null) {
    set({ open: true, arming: false, status: "thinking", text: "", goal, heard, turn: null });
  },

  reset() {
    set({ arming: false, status: "idle", text: "", goal: null, heard: null, turn: null, step: null });
  },

  setLang(lang: string) {
    set({ lang });
    chrome.storage?.local?.set({ [LANG_KEY]: lang }).catch(() => {});
  },

  showStep(target: Element | null, say: string, scam?: Scam) {
    set({ step: { target, say, scam } });
  },

  clearStep() {
    if (state.step) set({ step: null });
  },
};

// ---- live volume, deliberately outside React ----
// LANTERN_LEVEL arrives ~20 times a second while someone is talking. Re-rendering a React
// tree that often to move one canvas would be wasteful, so the orb reads this each frame.

export type LevelSource = "user" | "lantern" | null;

let level = 0;
let source: LevelSource = null;
let stamp = 0;

export function pushLevel(src: string, value: number): void {
  if (src === "user" || src === "lantern") source = src;
  level = Math.max(0, Math.min(1, Number(value) || 0));
  stamp = performance.now();
}

export function readLevel(): { level: number; source: LevelSource; age: number } {
  return { level, source, age: performance.now() - stamp };
}

export function clearLevel(): void {
  level = 0;
  source = null;
}
