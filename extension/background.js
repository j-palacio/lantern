// Lantern service worker entry. docs/ARCHITECTURE.md sections 3 and 5.
import { onMessage, onTabRemoved } from "./sw/loop.js";
import { toggleVoice } from "./sw/voice.js";

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  // Live volume from the offscreen document -> the page's visualizer (section 6.3).
  if (msg?.type === "OFFSCREEN_LEVEL") {
    chrome.tabs.sendMessage(msg.tabId, { type: "LANTERN_LEVEL", source: msg.source, level: msg.level }).catch(() => {});
    return false;
  }
  if (!msg?.type?.startsWith("LANTERN_")) return false;
  onMessage(msg, sender).then(reply, (err) => {
    console.error("[Lantern:sw]", msg.type, err);
    reply({ ok: false, error: String(err?.message || err) });
  });
  return true; // async reply
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "toggle-voice" && tab?.id != null) await toggleVoice(tab.id);
});

chrome.tabs.onRemoved.addListener(onTabRemoved);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.tabs.create({ url: chrome.runtime.getURL("welcome/welcome.html") });
});
