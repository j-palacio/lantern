// ElevenLabs speech-to-text (/transcribe) and text-to-speech (/speak).
// docs/ARCHITECTURE.md sections 6.2 and 12. Owner: J (Milestone 1).

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
  // TODO(Milestone 1): POST https://api.elevenlabs.io/v1/speech-to-text
  //   multipart: file=<audio>, model_id=<STT model>; header xi-api-key.
  //   Map the returned language code to ISO 639-1 ("spa" -> "es", "eng" -> "en").
  void audio; void mime;
  return { error: "transcribe_not_implemented" };
}

/**
 * @param {string} text
 * @param {string} lang  ISO 639-1
 * @returns {Promise<{audio: Buffer} | {error: string}>}
 */
export async function speak(text, lang) {
  if (!text) return { error: "empty_text" };
  if (!process.env.ELEVENLABS_API_KEY) {
    // The offscreen document falls back to the browser's built-in voice on any error.
    return { error: "no_elevenlabs_key" };
  }
  // TODO(Milestone 1): POST https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}
  //   JSON {text, model_id: <low-latency multilingual model>}; header xi-api-key;
  //   accept audio/mpeg. Return { audio: Buffer }.
  void lang;
  return { error: "speak_not_implemented" };
}
