// Lantern backend. Routes and contracts: docs/ARCHITECTURE.md section 6.2.
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, extname } from "node:path";
import { readFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(join(here, ".env"));
} catch {
  // No .env yet: the server still runs, /decide answers with mock steps.
}

const { decide } = await import("./decide.js");
const { transcribe, speak } = await import("./voice.js");

const PORT = Number(process.env.PORT || 8787);
const MB = 1024 * 1024;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error("too_large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const routes = {
  "GET /health": async (_req, res) => {
    sendJson(res, 200, {
      ok: true,
      gemini: Boolean(process.env.GEMINI_API_KEY),
      elevenlabs: Boolean(process.env.ELEVENLABS_API_KEY),
    });
  },

  "POST /decide": async (req, res) => {
    let body;
    try {
      body = JSON.parse((await readBody(req, 8 * MB)).toString("utf8"));
    } catch {
      return sendJson(res, 400, { error: "bad_json", retryable: false });
    }
    if (typeof body.goal !== "string" || !Array.isArray(body.elements)) {
      return sendJson(res, 400, { error: "missing_goal_or_elements", retryable: false });
    }
    sendJson(res, 200, await decide(body));
  },

  "POST /transcribe": async (req, res) => {
    const audio = await readBody(req, 5 * MB);
    if (audio.length < 1500) return sendJson(res, 200, { error: "audio_empty" });
    sendJson(res, 200, await transcribe(audio, req.headers["content-type"] || "audio/webm"));
  },

  "POST /speak": async (req, res) => {
    let body;
    try {
      body = JSON.parse((await readBody(req, 64 * 1024)).toString("utf8"));
    } catch {
      return sendJson(res, 400, { error: "bad_json" });
    }
    const out = await speak(String(body.text || ""), String(body.lang || "en"));
    if (out.error) return sendJson(res, 502, out);
    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    res.end(out.audio);
  },
};

// Demo pages: http://localhost:8787/demo/  (files in ../demo)
const DEMO_DIR = join(here, "..", "demo");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml" };
async function serveDemo(req, res) {
  let path = decodeURIComponent(req.url.split("?")[0].slice("/demo".length)) || "/";
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(DEMO_DIR, path));
  if (!file.startsWith(DEMO_DIR)) return sendJson(res, 403, { error: "forbidden" });
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    sendJson(res, 404, { error: "not_found" });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/demo" || req.url.startsWith("/demo/"))) {
    if (req.url === "/demo") { res.writeHead(301, { Location: "/demo/" }); return res.end(); }
    return serveDemo(req, res);
  }
  const route = routes[`${req.method} ${req.url.split("?")[0]}`];
  if (!route) return sendJson(res, 404, { error: "not_found" });
  const started = Date.now();
  try {
    await route(req, res);
  } catch (err) {
    console.error(`[lantern] ${req.method} ${req.url} failed:`, err.message);
    if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message || "server_error" });
  } finally {
    console.log(`[lantern] ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

server.listen(PORT, () => {
  const g = process.env.GEMINI_API_KEY ? process.env.GEMINI_MODEL : "MOCK (no GEMINI_API_KEY)";
  const v = process.env.ELEVENLABS_API_KEY ? "ElevenLabs" : "MOCK (no ELEVENLABS_API_KEY)";
  console.log(`[lantern] listening on http://localhost:${PORT}  decide: ${g}  voice: ${v}`);
});
