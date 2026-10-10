import type { Config } from "tailwindcss";

// Restraint is the point. One accent, used as a 7px dot and a focus ring - never as a slab.
// No gradients, no bloom: the only glowing thing Lantern owns is the highlight on the page.
// Preflight is off because we live in a shadow root; src/index.css carries a small reset.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        panel: "var(--l-panel)",
        raised: "var(--l-raised)",
        line: "var(--l-line)",
        ink: "var(--l-text)",
        muted: "var(--l-muted)",
        accent: "var(--l-accent)",
        danger: "var(--l-danger)",
        sky: "#58b4e6",
        iris: "#9a8cf0",
        mint: "#5bc98a",
      },
      fontFamily: {
        // Atkinson Hyperlegible when the user has it installed: the most legible of these.
        sans: [
          '"Atkinson Hyperlegible Next"',
          '"Atkinson Hyperlegible"',
          "system-ui",
          "-apple-system",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
      fontSize: {
        // Our readers are older adults: supporting text starts at 13px, anything they must
        // act on is 17px or more, and the instruction itself is the largest thing on screen.
        label: ["0.8125rem", { lineHeight: "1.25" }],
        meta: ["0.9375rem", { lineHeight: "1.45" }],
        body: ["1.0625rem", { lineHeight: "1.5" }],
        title: ["1.25rem", { lineHeight: "1.3" }],
        step: ["1.3125rem", { lineHeight: "1.4" }],
        say: ["1.375rem", { lineHeight: "1.4" }],
      },
      boxShadow: {
        panel: "0 18px 50px -16px rgba(0,0,0,.72), 0 2px 10px -3px rgba(0,0,0,.45)",
      },
    },
  },
} satisfies Config;
