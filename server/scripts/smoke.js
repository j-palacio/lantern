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

await check("decide rejects a bad body", async () => {
  const r = await fetch(BASE + "/decide", { method: "POST", body: "{}" });
  if (r.status !== 400) throw new Error(`status ${r.status}`);
  return { status: r.status };
});
