// Mic recording and audio playback. docs/ARCHITECTURE.md section 12.
const API = "http://localhost:8787";
let recorder = null;
let chunks = [];
let player = null;

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (!msg?.type?.startsWith("OFFSCREEN_")) return false;
  const handler = { OFFSCREEN_RECORD_START: start, OFFSCREEN_RECORD_STOP: stop, OFFSCREEN_SPEAK: speak }[msg.type];
  handler(msg).then(reply, (err) => reply({ ok: false, error: err?.name || String(err) }));
  return true;
});

async function start() {
  stopAudio();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  setTimeout(() => recorder?.state === "recording" && recorder.stop(), 30000); // safety cap
  return { ok: true };
}

async function stop() {
  if (!recorder) return { error: "not_recording" };
  const rec = recorder;
  recorder = null;
  if (rec.state === "recording") {
    await new Promise((r) => { rec.onstop = r; rec.stop(); });
  }
  rec.stream.getTracks().forEach((t) => t.stop());
  const blob = new Blob(chunks, { type: "audio/webm" });
  if (blob.size < 1500) return { error: "audio_empty" };
  try {
    const res = await fetch(`${API}/transcribe`, { method: "POST", headers: { "Content-Type": "audio/webm" }, body: blob });
    return await res.json(); // {text, lang} or {error}
  } catch {
    return { error: "server_down" };
  }
}

async function speak({ text, lang }) {
  stopAudio();
  try {
    const res = await fetch(`${API}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
    });
    if (res.ok && res.headers.get("content-type")?.includes("audio")) {
      player = new Audio(URL.createObjectURL(await res.blob()));
      await player.play();
      return { ok: true };
    }
  } catch {
    // fall through to the built-in voice
  }
  // Fallback: the browser's built-in voice, so the demo still talks without an ElevenLabs key.
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang || "en";
  speechSynthesis.speak(u);
  return { ok: true, fallback: true };
}

function stopAudio() {
  if (player) { player.pause(); player = null; }
  speechSynthesis.cancel();
}
