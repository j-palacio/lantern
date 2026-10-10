// Mic recording, audio playback, and live volume levels. docs/ARCHITECTURE.md section 12.
const API = "http://localhost:8787";
const LEVEL_MS = 50; // 20 level updates per second for the visualizer

let recorder = null;
let chunks = [];
let player = null;
let meter = null; // { timer, ctx } while a level meter is running

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg?.type?.startsWith("OFFSCREEN_") || msg.type === "OFFSCREEN_LEVEL") return false;
  const handler = { OFFSCREEN_RECORD_START: start, OFFSCREEN_RECORD_STOP: stop, OFFSCREEN_SPEAK: speak }[msg.type];
  if (!handler) return false;
  handler(msg).then(reply, (err) => reply({ ok: false, error: err?.name || String(err) }));
  return true;
});

// ---- levels (section 12, message OFFSCREEN_LEVEL) ----

function sendLevel(tabId, source, level) {
  if (tabId == null) return;
  chrome.runtime.sendMessage({ type: "OFFSCREEN_LEVEL", tabId, source, level }).catch(() => {});
}

/** Meters an audio node: RMS of the waveform, scaled to 0..1. */
function startMeter(tabId, source, connect) {
  stopMeter();
  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  connect(ctx, analyser);
  const buf = new Uint8Array(analyser.fftSize);
  const timer = setInterval(() => {
    analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    sendLevel(tabId, source, Math.min(1, Math.sqrt(sum / buf.length) * 4));
  }, LEVEL_MS);
  meter = { timer, ctx, tabId, source };
}

/** The browser voice cannot be metered, so send a gentle fake level while it talks. */
function startFakeMeter(tabId) {
  stopMeter();
  const t0 = performance.now();
  const timer = setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    sendLevel(tabId, "lantern", 0.35 + 0.25 * Math.abs(Math.sin(t * 9)) * Math.abs(Math.sin(t * 2.3)));
  }, LEVEL_MS);
  meter = { timer, ctx: null, tabId, source: "lantern" };
}

function stopMeter() {
  if (!meter) return;
  clearInterval(meter.timer);
  meter.ctx?.close();
  sendLevel(meter.tabId, meter.source, 0);
  meter = null;
}

// ---- recording ----

async function start({ tabId }) {
  stopAudio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  startMeter(tabId, "user", (ctx, analyser) => ctx.createMediaStreamSource(stream).connect(analyser));
  setTimeout(() => recorder?.state === "recording" && recorder.stop(), 30000); // safety cap
  return { ok: true };
}

async function stop() {
  if (!recorder) return { error: "not_recording" };
  const rec = recorder;
  recorder = null;
  stopMeter();
  if (rec.state === "recording") {
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
  }
  rec.stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: "audio/webm" });
  if (blob.size < 1500) return { error: "audio_empty" };
  const started = performance.now();
  try {
    const res = await fetch(`${API}/transcribe`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob });
    const out = await res.json(); // {text, lang} or {error}
    console.log(`[Lantern:offscreen] transcribe ${Math.round(performance.now() - started)}ms`, out);
    return out;
  } catch {
    return { error: "server_down" };
  }
}

// ---- speaking ----

async function speak({ text, lang, tabId }) {
  stopAudio();
  const started = performance.now();
  try {
    const res = await fetch(`${API}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (res.ok && res.headers.get("content-type")?.includes("audio")) {
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      player = audio;
      // Route playback through an analyser so the visualizer can follow Lantern's voice.
      startMeter(tabId, "lantern", (ctx, analyser) => {
        const src = ctx.createMediaElementSource(audio);
        src.connect(analyser);
        analyser.connect(ctx.destination);
      });
      audio.onended = () => { if (player === audio) { stopMeter(); player = null; } URL.revokeObjectURL(url); };
      console.log(`[Lantern:offscreen] speak ready in ${Math.round(performance.now() - started)}ms`);
      await audio.play();
      return { ok: true };
    }
  } catch {
    // fall through to the built-in voice
  }
  // Fallback: the browser's built-in voice, so the demo still talks without an ElevenLabs key.
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || "en";
  u.onstart = () => startFakeMeter(tabId);
  u.onend = u.onerror = () => stopMeter();
  speechSynthesis.speak(u);
  return { ok: true, fallback: true };
}

function stopAudio() {
  stopMeter();
  if (player) { player.pause(); player = null; }
  speechSynthesis.cancel();
}
