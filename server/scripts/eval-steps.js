// Step accuracy and latency on real screens from the demo site, in English and Spanish.
// Each case is a /decide request captured from the real extension (screenshot with numbered boxes,
// element list, page text) plus the element ids a correct step may point at.
// Run: node scripts/eval-steps.js   (needs GEMINI_API_KEY in server/.env; makes 66 Gemini calls)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(join(here, "..", ".env")); } catch {}
if (!process.env.GEMINI_API_KEY) { console.error("No GEMINI_API_KEY in server/.env"); process.exit(1); }
const { decide } = await import("../decide.js");

const cases = JSON.parse(readFileSync(join(here, "fixtures", "steps.json"), "utf8"));
const RUNS = Number(process.env.RUNS || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE = Number(process.env.PAUSE_MS || 4500); // stay under the free-tier requests-per-minute limit
// Rows that already passed or failed for real (not a quota error) are kept from the last run.
let kept = [];
try { kept = JSON.parse(readFileSync(join(here, "eval-results.json"), "utf8")).rows.filter((r) => !r.error); } catch {}
const rows = [];

for (const lang of ["en", "es"]) {
  for (const c of cases) {
    const req = { ...c.req, lang, goal: lang === "es" ? c.goal_es : c.req.goal };
    for (let run = 0; run < RUNS; run++) {
      const prev = kept.filter((r) => r.lang === lang && r.name === c.name)[run];
      if (prev) { rows.push(prev); continue; }
      let out, secs;
      for (let attempt = 0; attempt < 5; attempt++) {
        await sleep(attempt ? 15000 : PAUSE);
        const t = performance.now();
        out = await decide(req);
        secs = (performance.now() - t) / 1000;
        if (!out.error) break;
        console.log(`  rate limited or failed (${out.error}), retrying in 15 s`);
      }
      const ok = !out.error && (c.expect.includes("done") ? out.done === true : c.expect.includes(out.highlight));
      rows.push({ lang, name: c.name, ok, secs, highlight: out.highlight ?? null, done: !!out.done, error: out.error || null, say: out.say });
      console.log(`${ok ? "PASS" : "FAIL"} [${lang}] ${c.name}  ${secs.toFixed(2)} s  -> ${out.error || (out.done ? "done" : out.highlight)}  "${(out.say || "").slice(0, 70)}"`);
    }
  }
}

const pct = (xs) => ((100 * xs.filter((r) => r.ok).length) / xs.length).toFixed(1);
const ok = rows.filter((r) => !r.error);
const quant = (xs, q) => { const s = xs.filter((r) => !r.error).map((r) => r.secs).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const summary = {
  model: process.env.GEMINI_MODEL || "default",
  screens: cases.length, languages: 2, runs: RUNS, calls: rows.length,
  accuracy: pct(rows), accuracy_en: pct(rows.filter((r) => r.lang === "en")), accuracy_es: pct(rows.filter((r) => r.lang === "es")),
  median_s: quant(rows, 0.5).toFixed(2), p90_s: quant(rows, 0.9).toFixed(2),
  errors: rows.filter((r) => r.error).length,
};
console.log("\n" + JSON.stringify(summary, null, 2));
writeFileSync(join(here, "eval-results.json"), JSON.stringify({ summary, rows }, null, 2));
