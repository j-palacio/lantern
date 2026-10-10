// ElevenLabs speech-to-text (/transcribe) and text-to-speech (/speak).
// docs/ARCHITECTURE.md sections 6.2 and 12. Owner: J (Milestone 1).

const BASE = () => process.env.ELEVENLABS_BASE_URL || "https://api.elevenlabs.io";
const STT_MODEL = () => process.env.ELEVENLABS_STT_MODEL || "scribe_v2";
// eleven_flash_v2_5: ~75 ms model latency, 32 languages including Spanish.
const TTS_MODEL = () => process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
// multilingual_v2 does not accept language_code; the flash/turbo/v4 models do.
const TTS_TAKES_LANG = (model) => !model.startsWith("eleven_multilingual");

// ElevenLabs may answer with ISO 639-3 codes; the rest of Lantern uses ISO 639-1.
const ISO3_TO_1 = {
  eng: "en", spa: "es", por: "pt", fra: "fr", deu: "de", ita: "it", zho: "zh", cmn: "zh",
  jpn: "ja", kor: "ko", vie: "vi", tgl: "tl", fil: "tl", hat: "ht", rus: "ru", ara: "ar",
  hin: "hi", pol: "pl", ukr: "uk", nld: "nl", tur: "tr",
};
export function toIso1(code) {
  if (!code) return "en";
  const c = String(code).toLowerCase().split(/[-_]/)[0];
  return c.length === 2 ? c : ISO3_TO_1[c] || "en";
}

/**
 * @param {Buffer} audio  webm/opus bytes from the offscreen recorder
 * @param {string} mime
 * @returns {Promise<{text: string, lang: string} | {error: string}>}
 */
export async function transcribe(audio, mime) {
  if (!process.env.ELEVENLABS_API_KEY) {
    // Mock so the loop can be tested without keys.
    return { text: "pay my bill", lang: "en" };
  }
  const form = new FormData();
  form.append("model_id", STT_MODEL());
  form.append("file", new Blob([audio], { type: mime || "audio/webm" }), "goal.webm");

  const started = Date.now();
  try {
    const res = await fetch(`${BASE()}/v1/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      console.error(`[lantern] stt http ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { error: `stt_http_${res.status}` };
    }
    const data = await res.json();
    const text = String(data.text || "").trim();
    console.log(`[lantern] stt ${Date.now() - started}ms lang=${data.language_code} "${text.slice(0, 60)}"`);
    if (!text) return { error: "audio_empty" };
    return { text, lang: toIso1(data.language_code) };
  } catch (err) {
    console.error("[lantern] stt:", err.message);
    return { error: err.name === "TimeoutError" ? "stt_timeout" : "stt_failed" };
  }
}

// Small cache: the same instruction or warning is often spoken more than once.
const cache = new Map();
const CACHE_MAX = 50;

/**
 * @param {string} text
 * @param {string} lang  ISO 639-1
 * @returns {Promise<{audio: Buffer} | {error: string}>}
 */
export async function speak(text, lang) {
  if (!text) return { error: "empty_text" };
  if (!process.env.ELEVENLABS_API_KEY || !process.env.ELEVENLABS_VOICE_ID) {
    // The offscreen document falls back to the browser's built-in voice on any error.
    return { error: "no_elevenlabs_key" };
  }
  const model = TTS_MODEL();
  const key = `${model}|${process.env.ELEVENLABS_VOICE_ID}|${lang}|${text}`;
  if (cache.has(key)) return { audio: cache.get(key) };

  const body = { text, model_id: model };
  if (TTS_TAKES_LANG(model) && lang) body.language_code = lang;

  const started = Date.now();
  try {
    const res = await fetch(
      `${BASE()}/v1/text-to-speech/${encodeURIComponent(process.env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_64`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) {
      console.error(`[lantern] tts http ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return { error: `tts_http_${res.status}` };
    }
    const audio = Buffer.from(await res.arrayBuffer());
    console.log(`[lantern] tts ${Date.now() - started}ms ${audio.length}B lang=${lang}`);
    cache.set(key, audio);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
    return { audio };
  } catch (err) {
    console.error("[lantern] tts:", err.message);
    return { error: err.name === "TimeoutError" ? "tts_timeout" : "tts_failed" };
  }
}
