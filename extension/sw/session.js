// Per-tab session in chrome.storage.session. docs/ARCHITECTURE.md D9.
// Session: { goal, lang, turn, status, history: HistoryEntry[], lastStep }
// status: "observing" | "thinking" | "awaiting_action" | "settling" | "paused" | "error"
//   "paused": the tab went to the background mid-turn; tabs.onActivated runs the turn again.

const key = (tabId) => `session:${tabId}`;

export async function getSession(tabId) {
  return (await chrome.storage.session.get(key(tabId)))[key(tabId)] || null;
}

export async function saveSession(tabId, session) {
  await chrome.storage.session.set({ [key(tabId)]: session });
  return session;
}

export async function clearSession(tabId) {
  await chrome.storage.session.remove(key(tabId));
}

export function newSession(goal, lang) {
  return { goal, lang, turn: 1, status: "observing", history: [], lastStep: null, startedAt: Date.now() };
}

// A goal the user typed long ago should not wake up when they navigate somewhere unrelated:
// "buy a sofa" must not resume on a bill-pay page half an hour later.
const MAX_AGE_MS = 10 * 60 * 1000;

export function isStale(session) {
  return !session?.startedAt || Date.now() - session.startedAt > MAX_AGE_MS;
}
