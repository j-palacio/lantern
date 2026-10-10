// Offscreen document lifecycle, push-to-talk, speaking. docs/ARCHITECTURE.md section 12.
import { startGoal, sendToTab } from "./loop.js";

const OFFSCREEN_URL = "offscreen/offscreen.html";
let recordingTab = null;

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ["USER_MEDIA", "AUDIO_PLAYBACK"],
    justification: "Record the user's spoken goal and play spoken instructions.",
  });
}

export async function toggleVoice(tabId) {
  await ensureOffscreen();
  if (recordingTab == null) {
    const r = await chrome.runtime.sendMessage({ type: "OFFSCREEN_RECORD_START" });
    if (!r?.ok) {
      if (r?.error === "NotAllowedError") chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
      return sendToTab(tabId, { type: "LANTERN_STATUS", status: "error", text: "Please allow the microphone in the new tab." });
    }
    recordingTab = tabId;
    return sendToTab(tabId, { type: "LANTERN_STATUS", status: "listening", text: "Listening... press again when you're done." });
  }
  const tab = recordingTab;
  recordingTab = null;
  sendToTab(tab, { type: "LANTERN_STATUS", status: "thinking", text: "Got it, one moment..." });
  const r = await chrome.runtime.sendMessage({ type: "OFFSCREEN_RECORD_STOP" });
  if (!r?.text) {
    return sendToTab(tab, { type: "LANTERN_STATUS", status: "error", text: "I couldn't hear anything. Try again." });
  }
  await startGoal(tab, r.text, r.lang || "en");
}

export async function speak(text, lang) {
  if (!text) return;
  await ensureOffscreen();
  chrome.runtime.sendMessage({ type: "OFFSCREEN_SPEAK", text, lang }).catch(() => {});
}
