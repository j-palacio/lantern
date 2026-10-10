import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { MousePointerClick, TriangleAlert } from "lucide-react";
import type { Step } from "./store";

// The highlight on the real page is the hero interaction (docs/ARCHITECTURE.md section 9):
// a glowing ring on the target, a caption on whichever side has room, and a connector that
// flows from the caption to the ring so the two are unmistakably about the same thing.

const PAD = 7; // ring padding around the element
const GAP = 38; // space between target and caption; the connector lives in here
const EDGE = 14; // keep this far from the window edges
const TIP = 13; // arrowhead stops this far short of the ring

type Box = { l: number; t: number; w: number; h: number };
type Side = "below" | "above" | "right" | "left";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

function overlaps(a: Box, b: Box, slack = 10): boolean {
  return (
    a.l < b.l + b.w + slack && a.l + a.w > b.l - slack && a.t < b.t + b.h + slack && a.t + a.h > b.t - slack
  );
}

/** Caption position on one side of the target, or null when it does not fit there. */
function candidate(side: Side, box: Box, w: number, h: number): Box | null {
  const cx = box.l + box.w / 2;
  const cy = box.t + box.h / 2;
  let l: number;
  let t: number;
  if (side === "below") {
    l = cx - w / 2;
    t = box.t + box.h + GAP;
  } else if (side === "above") {
    l = cx - w / 2;
    t = box.t - GAP - h;
  } else if (side === "right") {
    l = box.l + box.w + GAP;
    t = cy - h / 2;
  } else {
    l = box.l - GAP - w;
    t = cy - h / 2;
  }

  // Slide along the free axis to stay on screen, then reject if it still does not fit.
  if (side === "below" || side === "above") l = clamp(l, EDGE, innerWidth - w - EDGE);
  else t = clamp(t, EDGE, innerHeight - h - EDGE);
  if (l < EDGE || t < EDGE || l + w > innerWidth - EDGE || t + h > innerHeight - EDGE) return null;

  const pos = { l, t, w, h };
  return overlaps(pos, box) ? null : pos;
}

export function Overlay({ step }: { step: Step | null }) {
  const reduce = useReducedMotion();
  const ring = useRef<HTMLDivElement>(null);
  const halo = useRef<HTMLDivElement>(null);
  const halo2 = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const line = useRef<SVGPathElement>(null);
  const head = useRef<SVGPolygonElement>(null);

  const target = step?.target ?? null;
  const danger = step?.scam?.risk === "high";
  const tracking = Boolean(target) && !danger;

  useEffect(() => {
    if (!tracking || !target) return;
    let raf = 0;
    let cur: Box | null = null;
    let size: { w: number; h: number } | null = null;

    const rectOf = (el: Element): DOMRect => {
      const L = (globalThis as { Lantern?: { viewportRect?: (e: Element) => DOMRect } }).Lantern;
      return L?.viewportRect ? L.viewportRect(el) : el.getBoundingClientRect();
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const r = rectOf(target);
      const want: Box = { l: r.left - PAD, t: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 };

      // Glide: the ring catches up over a few frames so the eye can follow it there.
      if (!cur || reduce) cur = { ...want };
      else {
        for (const k of ["l", "t", "w", "h"] as const) cur[k] += (want[k] - cur[k]) * 0.28;
        const drift =
          Math.abs(cur.l - want.l) + Math.abs(cur.t - want.t) + Math.abs(cur.w - want.w) + Math.abs(cur.h - want.h);
        if (drift < 0.6) cur = { ...want };
      }

      for (const el of [ring.current, halo.current, halo2.current]) {
        if (!el) continue;
        el.style.left = `${Math.round(cur.l)}px`;
        el.style.top = `${Math.round(cur.t)}px`;
        el.style.width = `${Math.round(cur.w)}px`;
        el.style.height = `${Math.round(cur.h)}px`;
      }

      // The caption follows the real rect, not the gliding one, so it settles first.
      const cap = caption.current;
      if (!cap) return;
      if (!size) size = { w: cap.offsetWidth, h: cap.offsetHeight };
      const box: Box = {
        l: Math.max(0, r.left),
        t: Math.max(0, r.top),
        w: Math.min(innerWidth, r.right) - Math.max(0, r.left),
        h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top),
      };
      const onScreen = box.w > 0 && box.h > 0;
      const room: Record<Side, number> = {
        below: innerHeight - (box.t + box.h),
        above: box.t,
        right: innerWidth - (box.l + box.w),
        left: box.l,
      };
      const order = (["below", "above", "right", "left"] as Side[]).sort((a, b) => room[b] - room[a]);

      let pos: Box | null = null;
      let side: Side = "below";
      for (const s of order) {
        pos = candidate(s, box, size.w, size.h);
        if (pos) {
          side = s;
          break;
        }
      }
      if (!pos || !onScreen) {
        // Nothing fits (tiny window, or the target is off screen): park it away from the target.
        const high = box.t > innerHeight / 2;
        pos = {
          l: clamp((innerWidth - size.w) / 2, EDGE, innerWidth - size.w - EDGE),
          t: high ? EDGE : innerHeight - size.h - EDGE,
          w: size.w,
          h: size.h,
        };
        side = high ? "below" : "above";
      }
      cap.style.left = `${Math.round(pos.l)}px`;
      cap.style.top = `${Math.round(pos.t)}px`;

      // Connector: from the caption edge facing the target to just short of the ring.
      const from = {
        x: side === "left" ? pos.l + pos.w : side === "right" ? pos.l : pos.l + pos.w / 2,
        y: side === "above" ? pos.t + pos.h : side === "below" ? pos.t : pos.t + pos.h / 2,
      };
      const near = {
        x: clamp(from.x, cur.l, cur.l + cur.w),
        y: clamp(from.y, cur.t, cur.t + cur.h),
      };
      const dx = near.x - from.x;
      const dy = near.y - from.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const to = { x: near.x - ux * TIP, y: near.y - uy * TIP };
      const visible = onScreen && len > TIP * 1.6;

      if (line.current) {
        line.current.setAttribute("d", `M ${from.x} ${from.y} L ${to.x} ${to.y}`);
        line.current.style.opacity = visible ? "1" : "0";
      }
      if (head.current) {
        const px = -uy;
        const py = ux;
        const tipX = to.x + ux * 11;
        const tipY = to.y + uy * 11;
        head.current.setAttribute(
          "points",
          `${tipX},${tipY} ${to.x + px * 7},${to.y + py * 7} ${to.x - px * 7},${to.y - py * 7}`,
        );
        head.current.style.opacity = visible ? "1" : "0";
      }
    };

    const remeasure = () => {
      size = null;
    };
    addEventListener("resize", remeasure);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", remeasure);
    };
  }, [tracking, target, reduce, step?.say]);

  // Scroll the target into view once, only when it is close to an edge. Guarded: we run on
  // every site, and a page is free to replace or break DOM methods on its own elements.
  useEffect(() => {
    if (!tracking || !target) return;
    try {
      const r = target.getBoundingClientRect();
      if ((r.top < 90 || r.bottom > innerHeight - 90) && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      }
    } catch {
      // not being able to scroll is survivable; losing the highlight is not
    }
  }, [tracking, target, reduce]);

  // Entrance only, deliberately no exit: the watcher clears the highlight the instant the user
  // acts, and an exiting animation would keep a stale ring on screen (and on the screenshot).
  const enter = reduce
    ? {}
    : {
        initial: { opacity: 0, scale: 0.94 },
        animate: { opacity: 1, scale: 1 },
        transition: { type: "spring" as const, stiffness: 420, damping: 32 },
      };

  if (!step) return null;

  return (
    <>
      {danger && (
        <motion.div
          initial={reduce ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-[2147483644] bg-black/60 pointer-events-none"
        />
      )}

      {tracking && (
        <>
          <div ref={halo} className="fixed z-[2147483645] pointer-events-none ring-halo" />
          <div ref={halo2} className="fixed z-[2147483645] pointer-events-none ring-halo ring-halo-2" />
          <motion.div ref={ring} {...enter} className="fixed z-[2147483646] pointer-events-none ring-core" />
          <svg className="fixed inset-0 z-[2147483646] pointer-events-none h-full w-full" aria-hidden="true">
            <path
              ref={line}
              className="connector-flow"
              fill="none"
              stroke="var(--l-accent)"
              strokeWidth={4}
              strokeLinecap="round"
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,.55))", opacity: 0 }}
            />
            <polygon
              ref={head}
              fill="var(--l-accent)"
              style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,.55))", opacity: 0 }}
            />
          </svg>
        </>
      )}

      <div
        ref={caption}
        className={
          tracking
            ? "fixed z-[2147483647] pointer-events-none"
            : "fixed left-1/2 top-[38%] z-[2147483647] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        }
        style={tracking ? { left: 0, top: 0 } : undefined}
      >
        <motion.div
          {...enter}
          role="status"
          aria-live="polite"
          className={[
            "flex max-w-[min(30rem,calc(100vw-2rem))] items-start gap-3 rounded-2xl border px-5 py-4 shadow-panel",
            danger ? "border-danger/40 bg-[#1b0d0f]" : "border-line bg-panel",
          ].join(" ")}
        >
          <span className={danger ? "mt-0.5 text-danger" : "mt-0.5 text-accent"}>
            {danger ? <TriangleAlert size={26} strokeWidth={2.4} /> : <MousePointerClick size={26} strokeWidth={2.4} />}
          </span>
          <span>
            <span className="block text-say font-semibold text-ink">{step.say}</span>
            {danger && step.scam?.reason && (
              <span className="mt-1.5 block text-body font-medium text-danger">{step.scam.reason}</span>
            )}
          </span>
        </motion.div>
      </div>
    </>
  );
}
