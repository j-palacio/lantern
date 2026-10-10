// Tests server/voice.js against a fake ElevenLabs server (no real keys needed).
// Run: npm run test:voice
import http from "node:http";

const seen = [];
const fake = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    seen.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.url === "/v1/speech-to-text") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ text: " Quiero pagar mi factura de luz. ", language_code: "spa", language_probability: 0.97 }));
    }
    if (req.url.startsWith("/v1/text-to-speech/voice123")) {
      res.writeHead(200, { "Content-Type": "audio/mpeg" });
      return res.end(Buffer.from("ID3fake-mp3-bytes"));
    }
    res.writeHead(404).end();
  });
});
await new Promise((r) => fake.listen(0, r));

process.env.ELEVENLABS_BASE_URL = `http://localhost:${fake.address().port}`;
process.env.ELEVENLABS_API_KEY = "test-key";
process.env.ELEVENLABS_VOICE_ID = "voice123";
const { transcribe, speak, toIso1 } = await import("../voice.js");

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " " + detail : ""}`);
  if (!ok) failed++;
};

const stt = await transcribe(Buffer.alloc(4000, 1), "audio/webm");
const sttReq = seen.find((s) => s.url === "/v1/speech-to-text");
check("transcribe returns trimmed text", stt.text === "Quiero pagar mi factura de luz.", JSON.stringify(stt));
check("transcribe maps spa -> es", stt.lang === "es");
check("transcribe sends the key", sttReq?.headers["xi-api-key"] === "test-key");
check("transcribe sends multipart with model + file",
  /multipart\/form-data/.test(sttReq?.headers["content-type"]) &&
  sttReq.body.includes("scribe_v2") && sttReq.body.includes('filename="goal.webm"'));

const tts = await speak("Haz clic en Pagar", "es");
const ttsReq = seen.find((s) => s.url.startsWith("/v1/text-to-speech/"));
const ttsBody = JSON.parse(ttsReq?.body.toString() || "{}");
check("speak returns audio bytes", tts.audio?.toString() === "ID3fake-mp3-bytes");
check("speak uses flash v2.5 with language_code", ttsBody.model_id === "eleven_flash_v2_5" && ttsBody.language_code === "es");
check("speak asks for mp3", ttsReq?.url.includes("output_format=mp3"));

const before = seen.length;
await speak("Haz clic en Pagar", "es");
check("speak caches repeated lines", seen.length === before);

check("toIso1 handles 2-letter, 3-letter and region codes",
  toIso1("en") === "en" && toIso1("eng") === "en" && toIso1("es-MX") === "es" && toIso1(undefined) === "en");

fake.close();
process.exitCode = failed ? 1 : 0;
