import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronDown, CornerDownLeft, Languages, LoaderCircle, Mic, Square, TriangleAlert, X } from "lucide-react";
import { Orb } from "./Orb";
import { actions, CHIPS, LANGS, type State, type Status } from "./store";

// Voice first, in any language: pressing the coin starts recording, exactly like Alt+L
// (docs/ARCHITECTURE.md section 1). Typing is the fallback, so it hides behind a link
// (section 12, item 5) and only it needs a language, since speech detects its own (D4).
//
// Three tiers, so Lantern never takes more room than the task needs:
//   coin     amber launcher: one press and you are talking
//   voice    the orb, the live level, and one round button to finish
//   task     what Lantern understood, what it is doing, the step to take now

const send = (msg: unknown) => chrome.runtime.sendMessage(msg).catch(() => {});

const DOT: Record<Status, string> = {
  idle: "bg-muted/70",
  listening: "bg-sky",
  thinking: "bg-iris",
  guiding: "bg-accent",
  done: "bg-mint",
  error: "bg-danger",
};

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-label font-semibold uppercase tracking-[0.1em] text-muted">{children}</div>
);

const StateLabel = ({ status }: { status: Status }) => (
  <Label>
    <span className="inline-flex items-center gap-2">
      <span className={`h-[7px] w-[7px] rounded-full ${DOT[status]}`} />
      {CHIPS[status]}
    </span>
  </Label>
);

function LangChip({ lang }: { lang: string }) {
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-meta text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
      >
        <Languages size={16} strokeWidth={2} />
        {current.label}
        <ChevronDown size={14} strokeWidth={2.4} className={open ? "rotate-180" : ""} />
      </button>
      {open && (
        <ul
          role="listbox"
          className="absolute bottom-11 right-0 z-10 w-44 overflow-hidden rounded-xl border border-line bg-raised py-1 shadow-panel"
        >
          {LANGS.map((l) => (
            <li key={l.code}>
              <button
                role="option"
                aria-selected={l.code === lang}
                onClick={() => {
                  actions.setLang(l.code);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-body text-ink transition-colors hover:bg-white/[0.06]"
              >
                {l.label}
                {l.code === lang && <Check size={17} strokeWidth={2.6} className="text-accent" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Tier 2: the voice tier. The orb and one round button, nothing competing. */
function VoicePanel({ state }: { state: State }) {
  const { status, arming, lang } = state;
  const [typing, setTyping] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listening = status === "listening";

  useEffect(() => {
    if (typing) input.current?.focus({ preventScroll: true });
  }, [typing]);

  const submit = () => {
    const goal = input.current?.value.trim();
    if (!goal) return;
    send({ type: "LANTERN_START", goal, lang });
    actions.guiding(goal, "typed");
  };

  const headline = arming ? "One moment…" : listening ? "I'm listening" : "Press and speak";
  const under = arming
    ? "Getting the microphone ready."
    : listening
      ? "Say what you want to do, then press the button."
      : "Say one thing you want to do on this page.";

  return (
    <div className="w-[21rem] max-w-[calc(100vw-3rem)]">
      <div className="flex items-start justify-between">
        <StateLabel status={status} />
        <button
          onClick={() => actions.open(false)}
          aria-label="Close Lantern"
          className="-mr-1.5 -mt-1.5 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
        >
          <X size={18} strokeWidth={2.2} />
        </button>
      </div>

      <div className="mt-2 flex flex-col items-center text-center">
        <Orb size={84} status={status} />
        <h2 className="mt-3 text-title font-semibold text-ink">{headline}</h2>
        <p className="mt-1 text-meta text-muted">{under}</p>

        {/* The one control that matters. Round, not a banner: press, talk, press again. */}
        <button
          onClick={() => {
            if (!listening) actions.arm();
            send({ type: "LANTERN_VOICE" });
          }}
          disabled={arming}
          aria-label={listening ? "Stop talking" : "Press and speak"}
          className={[
            "mt-4 grid h-16 w-16 place-items-center rounded-full transition",
            listening
              ? "bg-danger text-white hover:brightness-110"
              : "bg-accent text-[#241a00] hover:brightness-[1.06] disabled:opacity-60",
          ].join(" ")}
        >
          {arming ? (
            <LoaderCircle size={26} strokeWidth={2.6} className="animate-spin" />
          ) : listening ? (
            <Square size={24} strokeWidth={2.8} />
          ) : (
            <Mic size={26} strokeWidth={2.4} />
          )}
        </button>
        <p className="mt-2 text-label text-muted">
          {listening ? "Press when you're done" : "Any language — I answer in yours"}
        </p>
      </div>

      <div className="mt-3.5 border-t border-line pt-2.5">
        <AnimatePresence initial={false} mode="wait">
          {typing ? (
            <motion.div key="field" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.1 } }}>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-black/25 pl-3.5 pr-2 focus-within:border-accent/50">
                <input
                  ref={input}
                  type="text"
                  placeholder="pay my electric bill"
                  aria-label="Type what you want to do"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submit();
                    if (e.key === "Escape") setTyping(false);
                    e.stopPropagation(); // the page's own shortcuts never see this
                  }}
                  className="h-12 min-w-0 flex-1 bg-transparent text-body text-ink placeholder:text-muted/60 focus-visible:outline-none"
                />
                <button
                  onClick={submit}
                  aria-label="Start"
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.08] hover:text-ink"
                >
                  <CornerDownLeft size={18} strokeWidth={2.4} />
                </button>
              </div>
              {/* Typed goals have no spoken language to detect, so they pick one. */}
              <div className="mt-1 flex items-center justify-between">
                <button
                  onClick={() => setTyping(false)}
                  className="h-9 rounded-lg px-2 text-meta text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
                >
                  Use my voice
                </button>
                <LangChip lang={lang} />
              </div>
            </motion.div>
          ) : (
            <motion.button
              key="link"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              onClick={() => setTyping(true)}
              className="mx-auto block h-9 rounded-lg px-2 text-meta text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
            >
              Can't talk right now? Type it instead
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Tier 3: the walkthrough. What it understood, what it is doing, what to do now. */
function TaskPanel({ state }: { state: State }) {
  const { status, text, goal, heard, turn, lang } = state;
  const thinking = status === "thinking";
  const failed = status === "error";
  const finished = status === "done";
  const spoken = heard === "voice";
  const langLabel = LANGS.find((l) => l.code === lang)?.label;

  return (
    <div className="w-[23rem] max-w-[calc(100vw-3rem)]">
      <div className="flex items-center justify-between gap-3">
        <StateLabel status={status} />
        <div className="flex items-center gap-1">
          {turn != null && !finished && <span className="mr-1 text-label text-muted">Step {turn}</span>}
          <button
            onClick={() => {
              send({ type: "LANTERN_STOP" });
              (globalThis as { Lantern?: { stopGuiding?: () => void } }).Lantern?.stopGuiding?.();
              actions.reset();
            }}
            className="h-9 rounded-lg px-2.5 text-meta text-muted transition-colors hover:bg-white/[0.06] hover:text-danger"
          >
            Stop
          </button>
          <button
            onClick={() => actions.open(false)}
            aria-label="Close Lantern"
            className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-ink"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {goal && (
        <div className="mt-3">
          <Label>{spoken ? "You said" : "Your goal"}</Label>
          <p className="mt-1 flex items-start gap-2 text-body text-ink/85">
            {spoken && <Mic size={17} strokeWidth={2.2} className="mt-1 shrink-0 text-muted" />}
            <span>
              {goal}
              {heard === "typed" && langLabel && <span className="ml-2 text-label text-muted">{langLabel}</span>}
            </span>
          </p>
        </div>
      )}

      <div className="mt-3.5 border-t border-line pt-3.5">
        <Label>{failed ? "Problem" : finished ? "Result" : "Do this now"}</Label>
        {thinking && !text ? (
          <p className="mt-1.5 flex items-center gap-2 text-step text-muted">
            <LoaderCircle size={19} strokeWidth={2.4} className="animate-spin" />
            Reading the page…
          </p>
        ) : (
          <p
            className={[
              "mt-1.5 text-step font-semibold",
              failed ? "flex items-start gap-2 text-danger" : finished ? "text-mint" : "text-ink",
            ].join(" ")}
          >
            {failed && <TriangleAlert size={21} strokeWidth={2.4} className="mt-0.5 shrink-0" />}
            {text || "…"}
          </p>
        )}
      </div>

      {/* `highlight` is null whenever nothing on THIS page moves the goal forward - the step is
          "go to amazon.com" or "scroll down". Promising a highlight that was never drawn sends
          the user hunting for it (ARCHITECTURE section 6.2). */}
      {status === "guiding" && (
        <p className="mt-2.5 text-meta text-muted">
          {state.step?.target
            ? "Look for the highlighted button on the page. I'll notice when you do it, then say the next step out loud."
            : "Nothing on this page to point at yet. Do this, and I'll pick up again on the next page."}
        </p>
      )}
      {(finished || failed) && (
        <button
          onClick={() => {
            actions.reset();
            actions.arm();
            send({ type: "LANTERN_VOICE" });
          }}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-meta text-ink transition-colors hover:bg-white/[0.06]"
        >
          <Mic size={17} strokeWidth={2.4} />
          {failed ? "Try again" : "Ask for something else"}
        </button>
      )}
    </div>
  );
}

export function Widget({ state }: { state: State }) {
  const reduce = useReducedMotion();
  const { open, arming, status } = state;
  const working = status === "listening" || status === "thinking" || status === "guiding";
  // Anything past "I'm listening" is work in progress, so it belongs in the task tier - even
  // before the goal text is known (a spoken goal is transcribed in the service worker).
  const task = !arming && (status === "thinking" || status === "guiding" || status === "done" || status === "error");

  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 34 };
  const leave = { duration: reduce ? 0 : 0.14 };

  return (
    <div className="fixed bottom-5 right-5 z-[2147483647] font-sans">
      <AnimatePresence initial={false}>
        {!open ? (
          /* ---------- tier 1: press the coin and start talking ---------- */
          <motion.div
            key="coin"
            layoutId="lantern-shell"
            initial={reduce ? undefined : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, scale: 0.9, transition: leave }}
            transition={spring}
            className="group relative flex items-center justify-end"
          >
            <span className="pointer-events-none absolute right-[4.25rem] whitespace-nowrap rounded-lg border border-line bg-panel px-3 py-1.5 text-meta text-ink opacity-0 shadow-panel transition-opacity duration-200 group-hover:opacity-100">
              {working ? CHIPS[status] : "Press and speak"}
            </span>
            {working && <span className="coin-ring pointer-events-none absolute inset-0 rounded-full" />}
            <button
              onClick={() => {
                actions.arm();
                send({ type: "LANTERN_VOICE" });
              }}
              aria-label="Press and speak to Lantern"
              className="coin grid h-14 w-14 place-items-center rounded-full transition-transform duration-200 hover:scale-[1.06]"
            >
              <Mic size={25} strokeWidth={2.4} />
            </button>
          </motion.div>
        ) : (
          /* ---------- tiers 2 and 3 share one shell ---------- */
          <motion.div
            key="shell"
            layoutId="lantern-shell"
            initial={reduce ? undefined : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 10, scale: 0.98, transition: leave }}
            transition={spring}
            role="dialog"
            aria-label="Lantern"
            className="rounded-2xl border border-line bg-panel p-4 shadow-panel"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={task ? "task" : "voice"}
                initial={reduce ? undefined : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduce ? undefined : { opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: reduce ? 0 : 0.16 }}
              >
                {task ? <TaskPanel state={state} /> : <VoicePanel state={state} />}
              </motion.div>
            </AnimatePresence>

            <div className="mt-3.5 flex items-center gap-2 border-t border-line pt-3">
              {/* In the voice tier the big orb above is the identity, so this one steps aside. */}
              {task && <Orb size={22} status={status} quiet />}
              <span className="text-label font-semibold text-ink/70">Lantern</span>
              <span className="text-label text-muted">{arming ? "waking the microphone" : "your browser copilot"}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
