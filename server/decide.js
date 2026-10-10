// POST /decide: next step + scam check. docs/ARCHITECTURE.md sections 6.2 and 11.
import { buildRequest } from "./prompt.js";
import { scamFlags, riskFloor, maxRisk } from "./scam.js";

const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = 12000;

export async function decide(req) {
  const flags = scamFlags(req.page || {}, req.elements);
  const floor = riskFloor(flags);

  let out;
  if (!process.env.GEMINI_API_KEY) {
    out = mockDecide(req);
  } else {
    try {
      out = await callGemini(req, flags);
    } catch (err) {
      console.error("[lantern] gemini:", err.message);
      return { error: err.name === "TimeoutError" ? "gemini_timeout" : "gemini_failed", retryable: true };
    }
  }

  // TODO(Milestone 2): if out.highlight is not an id in req.elements, retry Gemini once
  // with a note ("Element N does not exist. Pick from the list."), then fall back to null.
  const ids = new Set(req.elements.map((e) => e.id));
  if (out.highlight != null && !ids.has(out.highlight)) out.highlight = null;

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
  return {
    say: String(out.say || ""),
    highlight: out.highlight ?? null,
    scam: { risk, reason },
    done: Boolean(out.done),
  };
}

const WARNING = {
  en: "Stop. This page looks like a scam. Don't pay or enter anything here.",
  es: "Alto. Esta página parece una estafa. No pague ni escriba nada aquí.",
};

async function callGemini(req, flags) {
  const res = await fetch(GEMINI_URL(process.env.GEMINI_MODEL || "gemini-3.1-flash-lite"), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY },
    body: JSON.stringify(buildRequest(req, flags)),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`gemini_http_${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}";
  return JSON.parse(text);
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
