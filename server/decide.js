// POST /decide: next step + scam check. docs/ARCHITECTURE.md sections 6.2 and 11.
import { buildRequest } from "./prompt.js";
import { scamFlags, riskFloor, maxRisk } from "./scam.js";

const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = 12000; // one Gemini call
const BUDGET_MS = 18000;  // whole /decide, including the retry; the extension gives up at 20 s (sw/api.js)
const MIN_RETRY_MS = 3000; // not worth retrying with less time left than this

export async function decide(req) {
  const flags = scamFlags(req.page || {}, req.elements);
  const floor = riskFloor(flags);
  const ids = new Set(req.elements.map((e) => e.id));

  let out;
  if (!process.env.GEMINI_API_KEY) {
    out = mockDecide(req);
  } else {
    try {
      out = await askGemini(req, flags, ids, floor);
    } catch (err) {
      console.error("[lantern] gemini:", err.message);
      return { error: err.name === "TimeoutError" ? "gemini_timeout" : "gemini_failed", retryable: true };
    }
  }

  const risk = maxRisk(out.scam?.risk || "low", floor);
  const reason = out.scam?.reason || (risk === "low" ? "" : flags.join(", "));
  if (risk === "high") {
    // Never point at anything on a high-risk page; the warning is the step (section 6.2).
    const modelWarned = out.scam?.risk === "high" && out.say;
    return {
      say: modelWarned ? String(out.say) : (WARNING[req.lang] || WARNING.en),
      highlight: null,
      scam: { risk, reason },
      done: false,
    };
  }

  // Still not a real id after the retry: point at nothing and ask for help (section 6.2).
  if (!out.done && badHighlight(out, ids)) {
    return { say: line(SCROLL, req.lang), highlight: null, scam: { risk, reason }, done: false };
  }
  return {
    say: out.say || (out.done ? line(DONE, req.lang) : line(SCROLL, req.lang)),
    highlight: out.done ? null : out.highlight,
    scam: { risk, reason },
    done: out.done,
  };
}

export const WARNING = {
  en: "Stop. This page looks like a scam. Don't pay or enter anything here.",
  es: "Alto. Esta página parece una estafa. No pague ni escriba nada aquí.",
};
const SCROLL = {
  en: "I can't find it on this screen. Try scrolling, or tell me more.",
  es: "No lo encuentro en esta pantalla. Intente bajar la página, o dígame más.",
};
const DONE = {
  en: "All done. Well done!",
  es: "Listo. ¡Muy bien hecho!",
};
const line = (table, lang) => table[lang] || table.en;

const badHighlight = (out, ids) => out.highlight !== null && !ids.has(out.highlight);

// "Click the search bar." and "click the Search bar" count as the same instruction.
const words = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const sameWords = (a, b) => words(a) !== "" && words(a) === words(b);

// One Gemini call, plus one retry if the answer is not JSON or points at an id that is not in the list.
async function askGemini(req, flags, ids, floor) {
  const deadline = Date.now() + BUDGET_MS;
  const answer = await callGemini(buildRequest(req, flags), deadline);
  let out = parseStep(answer);

  let note = null;
  const last = req.history?.at(-1);
  if (!out) note = "That was not valid JSON. Answer with the JSON object only.";
  else if (!out.done && badHighlight(out, ids) && out.scam.risk !== "high" && floor !== "high") {
    note = `Element ${out.highlight} does not exist. Pick from the list.`;
  } else if (!out.done && last?.outcome === "completed" && sameWords(out.say, last.say)) {
    note = `The user already did "${last.say}". Do not repeat it; give the step after it.`;
  }

  if (note && deadline - Date.now() >= MIN_RETRY_MS) {
    console.warn(`[lantern] gemini retry: ${note}`);
    try {
      const second = parseStep(await callGemini(buildRequest(req, flags, { answer, note }), deadline));
      if (second) out = second;
    } catch (err) {
      if (!out) throw err;
      console.warn("[lantern] gemini retry failed:", err.message); // keep the first answer; decide() handles it
    }
  }
  if (!out) throw new Error("gemini_bad_json");
  return out;
}

// Gemini sometimes answers "busy" (503/500) or "rate limited" (429) for a moment; one retry after a pause usually works.
const BUSY = new Set([429, 500, 503]);
const BUSY_PAUSE_MS = 800;

async function callGemini(body, deadline) {
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(GEMINI_URL(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, Math.min(TIMEOUT_MS, deadline - Date.now()))),
    });
    const canRetry = attempt === 1 && BUSY.has(res.status) && deadline - Date.now() >= MIN_RETRY_MS + BUSY_PAUSE_MS;
    if (!canRetry) break;
    console.warn(`[lantern] gemini busy (${res.status}), retrying`);
    await new Promise((r) => setTimeout(r, BUSY_PAUSE_MS));
  }
  if (!res.ok) throw new Error(`gemini_http_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text || "").join("") || "";
}

// Model text -> {say, highlight, scam, done} with clean types, or null if it is not usable JSON.
export function parseStep(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  let raw;
  try {
    raw = JSON.parse(text.slice(start, end + 1)); // tolerates ```json fences around the object
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  let highlight = raw.highlight;
  if (highlight === undefined || highlight === "" || highlight === "null") highlight = null;
  if (highlight !== null) highlight = Number(highlight); // "7" -> 7; junk -> NaN, which fails validation

  const risk = ["low", "medium", "high"].includes(raw.scam?.risk) ? raw.scam.risk : "low";
  return {
    say: typeof raw.say === "string" ? raw.say.trim() : "",
    highlight,
    scam: { risk, reason: typeof raw.scam?.reason === "string" ? raw.scam.reason : "" },
    done: raw.done === true || raw.done === "true",
  };
}

// Runs when GEMINI_API_KEY is not set, so the whole loop can be tested without keys.
// Picks the element whose text shares the most words with the goal.
const MOCK_SAY = {
  en: (t) => `Click "${t}"`,
  es: (t) => `Haz clic en "${t}"`,
};
function mockDecide(req) {
  const words = req.goal.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  let best = req.elements[0];
  let bestScore = 0;
  for (const el of req.elements) {
    const t = (el.text || "").toLowerCase();
    const score = words.filter((w) => t.includes(w)).length;
    if (score > bestScore) { best = el; bestScore = score; }
  }
  const say = (MOCK_SAY[req.lang] || MOCK_SAY.en)(best?.text || "?");
  return { say, highlight: best?.id ?? null, scam: { risk: "low", reason: "" }, done: false };
}

// Rules-only scam check for pages Lantern is not guiding (POST /scamcheck). No model call:
// instant, free, and the same rules /decide uses as its floor (section 11).
export function scamCheck({ page = {}, elements = [], lang = "en" }) {
  const flags = scamFlags(page, elements);
  const risk = riskFloor(flags);
  return { risk, reason: risk === "low" ? "" : plainReason(flags, lang), say: risk === "high" ? line(WARNING, lang) : "" };
}

// Rule flags -> one short sentence a person can read ("payment_trap:bitcoin" is not one).
const REASONS = {
  en: { payment: "It asks you to pay with gift cards or crypto", threat: "it threatens or rushes you", domain: "the web address is fake", http: "it asks for your card on an unsafe page" },
  es: { payment: "Le pide pagar con tarjetas de regalo o criptomonedas", threat: "lo amenaza o lo apura", domain: "la dirección web es falsa", http: "pide su tarjeta en una página insegura" },
};
function plainReason(flags, lang) {
  const t = REASONS[lang] || REASONS.en;
  const has = (k) => flags.some((f) => f.startsWith(k));
  const parts = [has("payment_trap:") && t.payment, has("urgent_threat:") && t.threat, has("lookalike_domain:") && t.domain, has("insecure_sensitive_field") && t.http].filter(Boolean);
  if (!parts.length) return "";
  const last = parts.pop();
  const and = lang === "es" ? " y " : " and ";
  const text = parts.length ? `${parts.join(", ")}${and}${last}` : last;
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}
