import { useEffect, useRef } from "react";
import { readLevel, type Status } from "./store";

// Layered blurred gradient blobs inside a dark well, additively blended: the orb breathes when
// idle, leans blue toward the user's voice and amber toward Lantern's. Levels come from
// LANTERN_LEVEL (docs/ARCHITECTURE.md section 12, item 7) - no mic code lives here.

const PALETTES: Record<string, [string, string, string]> = {
  idle: ["#ffe3a3", "#ffb703", "#f06000"],
  listening: ["#bdf0ff", "#49c6f5", "#2b6ef5"],
  thinking: ["#e8d9ff", "#a98bff", "#5b3fd4"],
  guiding: ["#fff0c2", "#ffb703", "#ff5d2e"],
  done: ["#d4f7df", "#4fc97e", "#1d7a4b"],
  error: ["#ffd0d4", "#ef5560", "#9b1220"],
  user: ["#bdf0ff", "#49c6f5", "#2b6ef5"],
  lantern: ["#fff0c2", "#ffb703", "#ff5d2e"],
};

const BLOBS = 5;
const LEVEL_IDLE_MS = 450; // no level for this long: back to the widget's own state
const TAU = Math.PI * 2;

function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function Orb({ size, status, quiet = false }: { size: number; status: Status; quiet?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;

    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const dpr = Math.min(3, devicePixelRatio || 1);
    el.width = Math.round(size * dpr);
    el.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    let prev = 0;
    let t = 0;
    let amp = 0;
    let pulse = 0;

    const draw = () => {
      const live = readLevel();
      const source = live.age < LEVEL_IDLE_MS ? live.source : null;
      const c = PALETTES[source ?? statusRef.current] ?? PALETTES.idle;
      const s = size;
      const cx = s / 2;
      const cy = s / 2;
      const base = s * (quiet ? 0.36 : 0.33);
      const speed = statusRef.current === "thinking" ? 3 : 1.1;
      const r = base * (1 + 0.035 * Math.sin(t * speed) + 0.16 * amp);

      ctx.clearRect(0, 0, s, s);

      // Glow spilling out of the orb, brighter the louder the voice.
      const glow = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.95);
      glow.addColorStop(0, rgba(c[1], 0.3 + 0.35 * amp));
      glow.addColorStop(1, rgba(c[1], 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.95, 0, TAU);
      ctx.fill();

      // The well, then the blobs inside it.
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.clip();
      const bg = ctx.createRadialGradient(cx, cy - r * 0.35, r * 0.1, cx, cy, r);
      bg.addColorStop(0, "#1b2130");
      bg.addColorStop(1, "#070a0f");
      ctx.fillStyle = bg;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

      ctx.globalCompositeOperation = "lighter";
      ctx.filter = `blur(${(r * 0.26).toFixed(1)}px)`;
      for (let i = 0; i < BLOBS; i++) {
        const ph = i * 2.399; // golden angle: evenly spread, never in sync
        const spin = (0.25 + i * 0.11) * (source === "user" ? 1.6 : 1);
        const ang = t * spin + ph;
        const dist = r * (0.1 + 0.3 * amp + 0.06 * Math.sin(t * 0.9 + ph));
        const bx = cx + Math.cos(ang) * dist;
        const by = cy + Math.sin(ang) * dist;
        const br = r * (0.5 + 0.16 * Math.sin(t * 1.3 + ph) + 0.12 * amp);
        const col = c[i % 3];
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
        g.addColorStop(0, rgba(col, 0.85));
        g.addColorStop(0.6, rgba(col, 0.32));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, TAU);
        ctx.fill();
      }
      ctx.filter = "none";
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();

      // Rim, plus a ring that snaps out on peaks so loud speech is obvious.
      ctx.lineWidth = Math.max(1.25, s * 0.012);
      ctx.strokeStyle = rgba(c[0], 0.55);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(c[1], 0.15 + 0.45 * pulse);
      ctx.beginPath();
      ctx.arc(cx, cy, r + s * 0.02 + s * 0.055 * pulse, 0, TAU);
      ctx.stroke();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - (prev || now)) / 1000);
      prev = now;
      if (!reduce.matches) t += dt;

      const live = readLevel();
      const want = live.age < LEVEL_IDLE_MS ? live.level : 0;
      amp += (want - amp) * Math.min(1, (want > amp ? 0.35 : 0.08) * dt * 60); // fast attack, slow release
      pulse = Math.max(pulse * 0.94, amp);
      draw();
    };

    const onVisibility = () => {
      cancelAnimationFrame(raf);
      prev = 0;
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [size, quiet]);

  return <canvas ref={canvas} aria-hidden="true" style={{ width: size, height: size }} className="block shrink-0" />;
}
