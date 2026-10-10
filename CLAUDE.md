# Lantern - Agent Instructions

Lantern is a Chrome extension (Manifest V3) plus a small Node backend. It guides older adults and non-English speakers through websites by voice: the user speaks a goal, Lantern highlights the next button and says what to do out loud in their language, and it warns them about scams before they pay. Built at Knight Hacks IX.

## Read first

1. `README.md` - what Lantern is and how we're building it.
2. `docs/ARCHITECTURE.md` - components and exact data contracts. Treat the contracts section as law.
3. `docs/MILESTONES.md` - the milestone you are working on. Do only that milestone.
4. `notes/PROGRESS.md` (local only, gitignored) - build log and known issues, if it exists.

## Working rules

- Do not change a contract in `docs/ARCHITECTURE.md` without asking the user first. If a change is approved, update ARCHITECTURE.md in the same change.
- Never run git commands (no add/commit/push/branch). Suggest a commit message instead.
- Lantern never clicks, types, or enters passwords for the user. Never add code that does.
- Secrets (`GEMINI_API_KEY`, `ELEVENLABS_API_KEY`) live only in `server/.env`. Never print, log, commit, or put them in the extension.
- Keep it demo-first: the demo flow in README.md must keep working after every change.
- When a milestone is done, update this file (if anything here changed) and `notes/PROGRESS.md`.

## Environment facts

- To fill in once the repo has code: ports, how to run the backend, how to load the extension unpacked.
