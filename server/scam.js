// Scam red-flag rules. docs/ARCHITECTURE.md section 11.
// Rules are instant and deterministic; their flags go into the Gemini prompt
// and set a minimum risk level (riskFloor).

// A payment trap is a REQUEST to pay with something untraceable, not a mention of it:
// honest shops have a "Gift Cards" link, scammers say "pay with gift cards".
const GIFT = "gift\\s?cards?|tarjetas? de regalo";
const CRYPTO = "bitcoin|btc|crypto(?:currency)?|criptomonedas?|cripto|usdt";
const WIRE = "wire transfer|transferencia (?:bancaria|internacional)";
const GAP = "(?:[^.!?\\n]|\\.(?=\\d))"; // stay inside one sentence ("$498.60" does not end it)
const trap = (src) => new RegExp(src, "i");
const PAYMENT_TRAPS = [
  // "pay your balance with gift cards", "pague con tarjetas de regalo"
  trap(`\\b(?:pay|paid|payment|settle|pague|pagar|paga|pago)\\b${GAP}{0,60}\\b(?:with|in|using|by|via|con|en|mediante)\\b${GAP}{0,40}?(${GIFT}|${CRYPTO}|${WIRE})`),
  // "buy gift cards and send us the codes", "compre tarjetas de regalo y envíe los códigos"
  trap(`\\b(?:buy|purchase|get|compre|comprar|compra)\\b${GAP}{0,40}?(${GIFT})${GAP}{0,80}(?:codes?|numbers?|pin|c[óo]digos?|n[úu]meros?)`),
  // "send $500 in Bitcoin to this wallet", "envíe el pago en criptomonedas"
  trap(`\\b(?:send|transfer|deposit|env[ií]e|enviar|transfiera|deposite)\\b${GAP}{0,40}?(${GIFT}|${CRYPTO})`),
];

// One pattern per kind of threat (English | Spanish), so a bilingual page does not
// count the same threat twice.
const URGENT_THREATS = [
  // account suspended or locked
  /account (has been |is |will be )?(suspended|locked|disabled|closed)|cuenta (ha sido |está |será |fue )?(suspendida|bloqueada|cerrada|cancelada)/i,
  // deadline in hours or minutes
  /within \d+ (hours?|minutes?)|en (las próximas |menos de )?\d+ (horas?|minutos?)/i,
  // service cut-off
  /will be (disconnected|shut off|cut off)|ser[áa] (cortad[oa]|desconectad[oa])|corte de (servicio|luz)/i,
  // police or court
  /\b(arrest(ed)?|warrant|legal action)\b|\barresto\b|orden de (arresto|captura)|acción legal/i,
  // last warning
  /final (notice|warning)|[úu]ltimo aviso|aviso final/i,
  // pay right now, or else
  /pay (now|immediately|today) (or|to avoid)|pague (hoy|de inmediato|inmediatamente)/i,
];

// Brand as written in a page title -> its real registered domain.
// Only the title is checked: honest shops mention "PayPal" or "Amazon" in their text all the time.
const BRANDS = {
  "sunrise power": "sunrisepower.com", // the demo utility
  "paypal": "paypal.com",
  "amazon": "amazon.com",
  "netflix": "netflix.com",
  "microsoft": "microsoft.com",
  "wells fargo": "wellsfargo.com",
  "bank of america": "bankofamerica.com",
  "fpl": "fpl.com",
  "irs": "irs.gov",
  "usps": "usps.com",
  "medicare": "medicare.gov",
};

// Words scammers bolt onto a brand with hyphens: "fpl-billpay-secure.com".
const BAIT_WORDS = new Set([
  "secure", "security", "pay", "payment", "payments", "billpay", "billing", "login", "signin",
  "verify", "verification", "account", "update", "support", "alert", "refund",
]);

const LEET = { 0: "o", 3: "e", 4: "a", 5: "s", 7: "t" };
const unleet = (s, one) => s.replace(/[013457]/g, (d) => (d === "1" ? one : LEET[d]));

const isLocal = (host) => host === "localhost" || /^[\d.]+$/.test(host) || host.includes(":");

// "pay.sunrisepower.com" -> "sunrisepower.com"; "x.co.uk" -> "x.co.uk".
function registeredDomain(host) {
  const labels = host.split(".");
  const twoPartTld = labels.length > 2 && labels.at(-1).length === 2 && /^(co|com|org|net|gov|ac|edu)$/.test(labels.at(-2));
  return labels.slice(twoPartTld ? -3 : -2).join(".");
}

/** @returns {string|null} why the domain looks fake, or null */
function lookalikeReason(host, title, text) {
  if (isLocal(host)) return null;
  // "name.localhost" always points at this computer, so the demo can run on a fake name.
  const domain = host.endsWith(".localhost") ? host.split(".").slice(-2).join(".") : registeredDomain(host);
  const tokens = domain.split(".")[0].split("-");

  // Digits for letters: "sunr1se" reads as a word that is on the page.
  const letters = `${title} ${text}`.toLowerCase().replace(/[^a-záéíóúñ]/g, "");
  for (const t of tokens) {
    if (t.length < 5 || !/\d/.test(t) || !/[a-z]/.test(t)) continue;
    if (letters.includes(unleet(t, "l")) || letters.includes(unleet(t, "i"))) return "digits for letters";
  }

  for (const [brand, real] of Object.entries(BRANDS)) {
    // Compare names only, so amazon.co.uk still counts as the real Amazon.
    if (new RegExp(`\\b${brand}\\b`, "i").test(title) && domain.split(".")[0] !== real.split(".")[0]) return `not the real ${brand} site`;
  }

  if (tokens.length >= 2 && tokens.some((t) => BAIT_WORDS.has(t))) return "extra words in the name";
  return null;
}

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
    const flag = m && `payment_trap:${m[1].toLowerCase()}`;
    if (flag && !flags.includes(flag)) flags.push(flag);
  }
  for (const re of URGENT_THREATS) {
    const m = text.match(re);
    if (m) flags.push(`urgent_threat:${m[0].toLowerCase()}`);
  }

  let url;
  try { url = new URL(page.url); } catch { url = null; }
  const host = url ? url.hostname.toLowerCase().replace(/^www\./, "") : "";
  const sensitive = elements.some((e) => /password|contraseña|card|tarjeta|cvv|cvc/i.test(e.text || ""));
  // Plain http on this computer is safe (and is how the demo pages are served).
  if (url && url.protocol === "http:" && !isLocal(host) && sensitive) flags.push("insecure_sensitive_field");

  // At most one lookalike flag, so a single bad domain does not reach "medium" by itself.
  const lookalike = url && /^https?:$/.test(url.protocol) ? lookalikeReason(host, page.title || "", page.text || "") : null;
  if (lookalike) flags.push(`lookalike_domain:${lookalike}`);

  return flags;
}

/** Minimum risk the rules allow, whatever Gemini says. */
export function riskFloor(flags) {
  const has = (kind) => flags.some((f) => f.startsWith(kind));
  // One kind of signal is never "high": a payment trap needs a threat or a fake-looking domain with it.
  if (has("payment_trap:") && (has("urgent_threat:") || has("lookalike_domain:"))) return "high";
  if (has("payment_trap:") || flags.length >= 2) return "medium";
  return "low";
}

const ORDER = { low: 0, medium: 1, high: 2 };
export function maxRisk(a, b) {
  return ORDER[a] >= ORDER[b] ? a : b;
}
