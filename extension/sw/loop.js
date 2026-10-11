// Step loop: observe -> think -> point -> wait. docs/ARCHITECTURE.md section 5.
import { getSession, saveSession, clearSession, newSession, isStale } from "./session.js";
import { captureWithMarks } from "./marks.js";
import { postDecide, postScamCheck } from "./api.js";
import { toggleVoice, speak } from "./voice.js";

const MAX_TURNS = 30;
const runs = new Map(); // tabId -> run token; a newer run makes older ones stop at their next check

export function sendToTab(tabId, msg) {
  return chrome.tabs.sendMessage(tabId, msg).catch(() => null); // no content script yet: HELLO resumes
}

export async function startGoal(tabId, goal, lang) {
  chrome.storage.local.set({ lastLang: lang }).catch(() => {}); // the guard speaks in this language
  await saveSession(tabId, newSession(goal, lang));
  await runTurn(tabId);
}

export async function onMessage(msg, sender) {
  const tabId = sender.tab?.id;
  if (tabId == null) return { ok: false };
  const s = await getSession(tabId);

  switch (msg.type) {
    case "LANTERN_START":
      startGoal(tabId, msg.goal, msg.lang || "en");
      return { ok: true };

    case "LANTERN_STOP":
      runs.delete(tabId);
      await clearSession(tabId);
      return { ok: true };

    case "LANTERN_VOICE":
      toggleVoice(tabId);
      return { ok: true };

    case "LANTERN_STEP_RESULT":
      if (s && s.turn === msg.turn && s.status === "awaiting_action") {
        s.history.push({ turn: s.turn, say: s.lastStep?.say, highlight: s.lastStep?.highlight, outcome: msg.outcome });
        s.history = s.history.slice(-10);
        s.turn += 1;
        s.status = "settling";
        await saveSession(tabId, s);
      }
      return { ok: true };

    case "LANTERN_READY":
      if (s && s.turn === msg.turn && s.status === "settling") runTurn(tabId);
      return { ok: true };

    case "LANTERN_HELLO": // a page (re)loaded in this tab
      if (!s) {
        guard(tabId); // no goal: still warn about scam pages
        return null;
      }
      if (isStale(s)) {
        // An old goal must not follow the user onto an unrelated page (section 5).
        console.log("[Lantern:sw] dropping a stale goal in tab", tabId);
        await clearSession(tabId);
        return null;
      }
      if (s.status === "awaiting_action") {
        s.history.push({ turn: s.turn, say: s.lastStep?.say, highlight: s.lastStep?.highlight, outcome: "page_changed" });
        s.turn += 1;
        await saveSession(tabId, s);
      }
      if (s.status !== "error") runTurn(tabId);
      return { goal: s.goal, status: s.status };

    default:
      return { ok: false };
  }
}

export async function onTabRemoved(tabId) {
  runs.delete(tabId);
  await clearSession(tabId);
}

// A paused turn waits here, not in memory, so it also survives the service worker shutting down.
export async function onTabActivated({ tabId }) {
  const s = await getSession(tabId);
  if (s?.status !== "paused") return;
  if (isStale(s)) return clearSession(tabId);
  runTurn(tabId);
}

/**
 * captureVisibleTab always grabs the window's *active* tab, so running a turn while the guided
 * tab is in the background would screenshot whatever the user switched to. Park the turn instead
 * and let tabs.onActivated run it again from the top (section 5).
 */
async function parkIfBackground(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) return null;
  if (tab.active) return tab;
  const s = await getSession(tabId);
  if (!s) return null;
  s.status = "paused";
  await saveSession(tabId, s);
  console.log("[Lantern:sw] tab", tabId, "is in the background: turn paused");
  return null;
}

async function runTurn(tabId) {
  const token = Symbol();
  runs.set(tabId, token);
  const stale = () => runs.get(tabId) !== token;

  let s = await getSession(tabId);
  if (!s) return;
  if (s.turn > MAX_TURNS) {
    await clearSession(tabId);
    return sendToTab(tabId, { type: "LANTERN_STATUS", status: "error", text: "This is taking longer than expected. Let's start over." });
  }

  let tab = await parkIfBackground(tabId);
  if (!tab || stale()) return;

  s.status = "observing";
  await saveSession(tabId, s);

  // 1. Scan (content hides Lantern UI so the screenshot never shows it).
  const scan = await sendToTab(tabId, { type: "LANTERN_SCAN" });
  if (!scan || stale()) return;

  // 2. Screenshot with numbered boxes, then show the UI again.
  let screenshot = "";
  try {
    // The user can switch tabs while we are scanning: check again right before the capture.
    tab = await parkIfBackground(tabId);
    if (!tab) return;
    screenshot = await captureWithMarks(tab.windowId, scan.page, scan.elements);
  } catch (err) {
    console.warn("[Lantern:sw] screenshot failed, sending text only:", err.message);
  } finally {
    sendToTab(tabId, { type: "LANTERN_SHOW_UI" });
  }
  if (stale()) return;

  // 3. Ask the backend.
  s = await getSession(tabId);
  if (!s) return;
  s.status = "thinking";
  await saveSession(tabId, s);
  sendToTab(tabId, { type: "LANTERN_STATUS", status: "thinking", text: "Looking..." });

  const res = await postDecide({
    goal: s.goal, lang: s.lang, turn: s.turn,
    page: scan.page, elements: scan.elements, history: s.history, screenshot,
  });
  s = await getSession(tabId);
  if (!s || stale()) return;

  if (res.error) {
    s.status = "error";
    await saveSession(tabId, s);
    return sendToTab(tabId, { type: "LANTERN_STATUS", status: "error", text: res.error });
  }

  // 4. Point and speak.
  if (res.done) {
    await clearSession(tabId);
    sendToTab(tabId, { type: "LANTERN_DONE", say: res.say });
    return speak(res.say, s.lang, tabId);
  }
  s.lastStep = { say: res.say, highlight: res.highlight };
  s.status = "awaiting_action";
  await saveSession(tabId, s);
  sendToTab(tabId, { type: "LANTERN_STEP", turn: s.turn, step: { say: res.say, highlight: res.highlight, scam: res.scam } });
  speak(res.say, s.lang, tabId);
}

/**
 * Scam guard for pages Lantern is not guiding: a rules-only check (no model call) on every page
 * load. A high-risk page gets the same red warning and spoken alert as during a goal.
 */
async function guard(tabId) {
  const scan = await sendToTab(tabId, { type: "LANTERN_SCAN" });
  sendToTab(tabId, { type: "LANTERN_SHOW_UI" });
  if (!scan) return;
  const lang = (await chrome.storage.local.get("lastLang").catch(() => ({}))).lastLang || "en";
  const res = await postScamCheck({ page: scan.page, elements: scan.elements, lang });
  if (res?.risk !== "high" || (await getSession(tabId))) return; // a goal started meanwhile: it warns itself
  sendToTab(tabId, { type: "LANTERN_STEP", turn: 0, step: { say: res.say, highlight: null, scam: { risk: "high", reason: res.reason } } });
  speak(res.say, lang, tabId);
}
