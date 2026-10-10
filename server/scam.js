// Scam red-flag rules. docs/ARCHITECTURE.md section 11.
// Rules are instant and deterministic; their flags go into the Gemini prompt
// and set a minimum risk level (riskFloor).

const PAYMENT_TRAPS = [
  /gift\s?cards?/i, /tarjetas? de regalo/i,
  /bitcoin|crypto|cripto|usdt/i,
  /wire transfer|transferencia (bancaria|internacional)/i,
];

// TODO(Milestone 4): urgent-threat phrases (EN + ES), e.g. "account suspended",
// "pay within 24 hours", "arrest", "cuenta suspendida", "pague hoy".
const URGENT_THREATS = [];

/**
 * @param {{url: string, title?: string, text?: string}} page
 * @param {Array<{role: string, text: string}>} elements
 * @returns {string[]} short machine-readable flags, e.g. ["payment_trap:gift card"]
 */
export function scamFlags(page, elements) {
  const flags = [];
  const text = `${page.title || ""}\n${page.text || ""}`;

  for (const re of PAYMENT_TRAPS) {
    const m = text.match(re);
    if (m) flags.push(`payment_trap:${m[0].toLowerCase()}`);
  }
  for (const re of URGENT_THREATS) {
    const m = text.match(re);
    if (m) flags.push(`urgent_threat:${m[0].toLowerCase()}`);
  }

  let url;
  try { url = new URL(page.url); } catch { url = null; }
  const sensitive = elements.some((e) => /password|contraseña|card|tarjeta|cvv|cvc/i.test(e.text || ""));
  if (url && url.protocol === "http:" && sensitive) flags.push("insecure_sensitive_field");

  // TODO(Milestone 4): lookalike domain check (brand named on the page but a
  // different registered domain, extra words like "-secure-pay", digits for letters).

  return flags;
}

/** Minimum risk the rules allow, whatever Gemini says. */
export function riskFloor(flags) {
  if (flags.some((f) => f.startsWith("payment_trap:"))) return "high";
  if (flags.length >= 2) return "medium";
  return "low";
}

const ORDER = { low: 0, medium: 1, high: 2 };
export function maxRisk(a, b) {
  return ORDER[a] >= ORDER[b] ? a : b;
}
