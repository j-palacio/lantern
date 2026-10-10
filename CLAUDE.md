# Lantern - Agent Instructions

Lantern is a Chrome extension (Manifest V3) plus a small Node backend. It guides older adults and non-English speakers through websites by voice: the user speaks a goal, Lantern highlights the next button and says what to do out loud in their language, and it warns them about scams before they pay. Built at Knight Hacks IX.

## Read first

1. `README.md` - what Lantern is and how to run it.
2. `docs/ARCHITECTURE.md` - decisions, components, exact data contracts. Treat section 6 (contracts) as law; code comments refer to its section numbers.
3. `docs/MILESTONES.md` - the milestone you are working on. Build only that one.

## Working rules

- Do not change a contract in `docs/ARCHITECTURE.md` section 6 without asking the user first. If a change is approved, update ARCHITECTURE.md in the same change.
- Never run git commands (no add/commit/push/branch). Suggest a commit message instead.
- Stay inside your milestone's files. If you must touch another milestone's file, say so first.
- Lantern never clicks, types, or enters passwords for the user. Never add code that does.
- Secrets (`GEMINI_API_KEY`, `ELEVENLABS_API_KEY`) live only in `server/.env`. Never print, log, commit, or put them in the extension.
- Keep it simple. Page logic (`extension/content/*.js`, `extension/sw/*.js`, `server/`) stays plain JS, no build step, zero dependencies. The in-page UI lives in `ui/` (React + TypeScript + Tailwind + Framer Motion + lucide, built by Vite to `extension/dist/content.js`). No new dependencies anywhere unless the user agrees.
- Keep it demo-first: the demo flow in `docs/MILESTONES.md` (Milestone 5) must keep working after every change.
- After a change: `cd server && npm run smoke` (with the server running).

## Environment facts

- Node 20.12+ (uses `process.loadEnvFile`, global `fetch`).
- Backend: `cd server && npm run dev` -> `http://localhost:8787`. Without keys it still runs: `/decide` answers with mock steps and `/speak` falls back to the browser voice.
- Demo pages are served by the backend at `http://localhost:8787/demo/` (files in `demo/`).
- Extension: `chrome://extensions` -> Developer mode -> Load unpacked -> `extension/`. After extension changes, click reload on Lantern and refresh the page. After editing anything in `ui/`, run `cd ui && npm run build` first (`npm run watch` while working).
- Logs: content script `[Lantern]` in the page's DevTools console; service worker under `chrome://extensions` -> Lantern -> "service worker"; backend logs one line per request.
