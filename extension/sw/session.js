// Per-tab session in chrome.storage.session. docs/ARCHITECTURE.md D9.
// Session: { goal, lang, turn, status, history: HistoryEntry[], lastStep }
// status: "observing" | "thinking" | "awaiting_action" | "settling" | "error"

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
  return { goal, lang, turn: 1, status: "observing", history: [], lastStep: null };
}
