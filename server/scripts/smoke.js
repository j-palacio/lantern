// Quick check that the server answers each route. Run: npm run smoke (server must be running).
const BASE = process.env.LANTERN_URL || "http://localhost:8787";

const page = (url, text) => ({ url, title: "Billing", text, viewport: { width: 1280, height: 720, dpr: 1 } });
const elements = [
  { id: 1, role: "link", text: "Home", hasValue: false, rect: { x: 10, y: 10, w: 60, h: 20 } },
  { id: 2, role: "button", text: "Pay my bill", hasValue: false, rect: { x: 10, y: 50, w: 120, h: 40 } },
];

async function check(name, fn) {
  try {
    const out = await fn();
    console.log(`PASS ${name}`, JSON.stringify(out));
  } catch (err) {
    console.log(`FAIL ${name}: ${err.message}`);
    process.exitCode = 1;
  }
}

const post = (path, body) =>
  fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json());

await check("health", async () => {
  const h = await fetch(BASE + "/health").then((r) => r.json());
  if (!h.ok) throw new Error("not ok");
  return h;
});

await check("decide picks an element", async () => {
  const r = await post("/decide", { goal: "pay my bill", lang: "en", turn: 1, page: page("https://power.example.com", "Welcome"), elements, history: [] });
  if (r.error) throw new Error(r.error);
  if (![1, 2, null].includes(r.highlight)) throw new Error("highlight not in list");
  return r;
});

await check("decide flags a gift-card scam as high", async () => {
  const r = await post("/decide", { goal: "pagar mi factura", lang: "es", turn: 1, page: page("http://fpl-billpay-secure.com", "Pay your overdue balance with Google Play gift cards today"), elements, history: [] });
  if (r.scam?.risk !== "high") throw new Error(`risk was ${r.scam?.risk}`);
  if (r.highlight !== null) throw new Error("must not highlight on a high-risk page");
  return r;
});

// Milestone 4: scam rules (docs/ARCHITECTURE.md section 11).
const scamCase = (url, title, text, els = elements) =>
  post("/decide", { goal: "pay my bill", lang: "en", turn: 1, page: { ...page(url, text), title }, elements: els, history: [] });
const cardField = { id: 3, role: "input", text: "Card number", hasValue: false, rect: { x: 10, y: 100, w: 300, h: 40 } };

await check("scam: the honest demo page stays low", async () => {
  const r = await scamCase("http://localhost:8787/demo/", "Sunrise Power - My Account",
    "Sunrise Power Home Outages Usage Help Special offer: save 50% on your next statement Hello, Maria Your balance: $84.12, due October 20. View usage Paperless billing Pay bill Pay your bill Amount Card number Submit payment",
    [...elements, cardField]);
  if (r.scam?.risk !== "low") throw new Error(`risk was ${r.scam?.risk}`);
  if (r.highlight === null) throw new Error("should still point at a button");
  return r;
});

await check("scam: the demo scam page is high", async () => {
  const r = await scamCase("http://localhost:8787/demo/scam.html", "Sunrise Power - FINAL NOTICE: Overdue Balance",
    "FINAL NOTICE - your power will be disconnected in 29:58 Your account has been suspended You must pay within 30 minutes or a technician will shut off your electricity today. Pay now with gift cards (Google Play, Apple or Target) or with Bitcoin.");
  if (r.scam?.risk !== "high") throw new Error(`risk was ${r.scam?.risk}`);
  if (r.highlight !== null) throw new Error("must not highlight on a high-risk page");
  return r;
});

await check("scam: a shop with a Gift Cards link stays low", async () => {
  const r = await scamCase("https://www.amazon.com/", "Amazon.com. Spend less. Smile more.",
    "Today's Deals\nCustomer Service\nRegistry\nGift Cards\nSell\nShop gift cards for every occasion\nBuy a gift card\nRedeem a gift card code\nPay with a credit card or debit card.");
  if (r.scam?.risk !== "low") throw new Error(`risk was ${r.scam?.risk}`);
  if (r.highlight === null) throw new Error("should still point at a button");
  return r;
});

await check("scam: a gift-card payment request alone is medium, not high", async () => {
  const r = await scamCase("https://shop.example.com/checkout", "Checkout", "Pay your balance with gift cards.");
  if (r.scam?.risk !== "medium") throw new Error(`risk was ${r.scam?.risk}`);
  return r;
});

await check("scam: an urgent-only page is medium", async () => {
  const r = await scamCase("https://power.example.com/notice", "Billing",
    "Aviso final: su cuenta ha sido suspendida. Pague hoy para evitar el corte de servicio.");
  if (r.scam?.risk !== "medium") throw new Error(`risk was ${r.scam?.risk}`);
  return r;
});

// The rules alone say "medium" here; Gemini may raise it to "high", which is fine for a fake domain taking a card.
await check("scam: a lookalike domain with a card field is at least medium", async () => {
  const r = await scamCase("http://sunr1se-power-secure-pay.com/login", "Sunrise Power - Pay your bill", "Welcome back. Enter your card to continue.",
    [...elements, cardField]);
  if (!["medium", "high"].includes(r.scam?.risk)) throw new Error(`risk was ${r.scam?.risk}`);
  return r;
});

await check("scam: the real brand domain over https stays low", async () => {
  const r = await scamCase("https://pay.sunrisepower.com/billing", "Sunrise Power - Pay your bill", "Welcome back. Enter your card to continue.",
    [...elements, cardField]);
  if (r.scam?.risk !== "low") throw new Error(`risk was ${r.scam?.risk}`);
  return r;
});

await check("decide rejects a bad body", async () => {
  const r = await fetch(BASE + "/decide", { method: "POST", body: "{}" });
  if (r.status !== 400) throw new Error(`status ${r.status}`);
  return { status: r.status };
});
