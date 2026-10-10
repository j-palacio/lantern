# Milestones

The skeleton already runs end to end with mock data: type a goal, Lantern scans the page, takes a numbered screenshot, asks `/decide`, highlights a button, notices your click, and gives the next step. Each milestone below replaces one mock or rough part with the real thing. They touch different files, so everyone can work at the same time.

## How to work a milestone

1. `git checkout -b m<N>-<short-name>` (for example `m2-gemini`).
2. Open a **fresh** Claude Code session in the repo and paste:

   > Read CLAUDE.md, docs/ARCHITECTURE.md, and Milestone N in docs/MILESTONES.md. Build only Milestone N. Do not change any contract in ARCHITECTURE.md section 6 without asking me. When it passes its tests, tell me what changed.

3. Test it the way the milestone says, push your branch, and open a pull request. J merges.

| # | Milestone | Owner | Status |
|---|---|---|---|
| 1 | Real voice: ElevenLabs STT + TTS, visualizer | J | Not started |
| 2 | Real decisions: Gemini, validation, prompt | TBD | Not started |
| 3 | Overlay, widget and scanner polish | TBD | Not started |
| 4 | Scam check rules + demo pages | TBD | Not started |
| 5 | Demo script, Devpost, backup video | Everyone | Saturday evening |

---

## Milestone 1 - Real voice (J)

**Goal:** speak a goal in English or Spanish, hear every step read back in the same language with ElevenLabs.

**Files:** `server/voice.js`, `extension/offscreen/offscreen.js`, `extension/content/widget.js` (visualizer only).

**Build:**
- `transcribe()`: ElevenLabs speech-to-text from the webm bytes; return `{text, lang}` with `lang` as ISO 639-1 (map 3-letter codes like `spa` -> `es`).
- `speak()`: ElevenLabs text-to-speech with `ELEVENLABS_VOICE_ID` and a low-latency multilingual model; return the MP3 bytes.
- Keep the built-in browser voice fallback in `offscreen.js` for when the key is missing or the call fails.
- Visualizer: a small canvas in the widget that reacts to the mic while listening and to Lantern's voice while speaking (Web Audio `AnalyserNode`).
- Log how long each call takes; aim for under 1.5 s from "done talking" to the first highlight.

**Test:** with keys in `server/.env`, press `Alt+L`, say "quiero pagar mi factura de luz", press again. The widget shows the goal, the step is spoken in Spanish. Pull the key: Lantern still speaks with the browser voice.

---

## Milestone 2 - Real decisions (owner: TBD)

**Goal:** Gemini picks the right button reliably on the demo pages and on one real site.

**Files:** `server/decide.js`, `server/prompt.js`.

**Build:**
- Run with a real `GEMINI_API_KEY` and fix whatever breaks.
- Validation (section 6.2): if `highlight` is not an id from the request, retry once with the note "Element N does not exist. Pick from the list."; still wrong -> `highlight: null` with a "try scrolling, or tell me more" line in the user's language.
- Use `history` so Lantern does not repeat a step the user already did.
- Tune the prompt until the demo flow (section "Demo flow" in Milestone 5) is right 9 times out of 10. Write down accuracy and the average `/decide` time.

**Test:** `npm run smoke` passes. Then run the demo flow on `http://localhost:8787/demo/` 10 times with the real key and count correct steps.

---

## Milestone 3 - Overlay, widget and scanner polish (owner: TBD)

**Goal:** it looks great and never points at the wrong thing.

**Files:** `extension/content/overlay.js`, `extension/content/widget.js` (not the visualizer), `extension/content/scanner.js`, `extension/sw/marks.js`, `extension/sw/loop.js` (background-tab pause only).

**Build:**
- Overlay: smooth movement, a clear arrow or cursor toward the target, caption that never covers the target, big readable text (consider the Atkinson Hyperlegible font).
- Widget: clean idle / listening / thinking / guiding / done / error states; Stop always works.
- Number tags in `marks.js` must never cover a neighbouring element (see Pointr's ARCHITECTURE section 8 for a good placement rule).
- Scanner: test on two real sites (an airline or a bank login page); fix missed or duplicated elements.
- If the guided tab goes to the background, pause the turn and resume on `chrome.tabs.onActivated`.

**Test:** load the extension, run the demo flow, and screenshot every state. Check a real site's numbered screenshot (add a temporary `console.log` of the image size or save it once) to confirm no tags overlap.

---

## Milestone 4 - Scam check + demo pages (owner: TBD)

**Goal:** the scam warning in the demo is impossible to miss and never fires on the honest page.

**Files:** `server/scam.js`, `demo/` (new pages), `server/scripts/smoke.js` (new cases).

**Build:**
- Rules in `scam.js` (section 11): urgent threats in English and Spanish, lookalike domains (brand on the page but a different domain, `-secure-pay` style extra words, digits for letters), plus the existing gift-card/crypto and insecure-field rules.
- `demo/scam.html`: a fake "Sunrise Power" overdue-bill page on a lookalike name that asks for gift cards or crypto with a countdown. Link to it from `demo/index.html` (for example a "Special offer" banner) so the demo can walk into it.
- Add smoke cases: the honest page stays `low`, the scam page is `high`, an urgent-only page is `medium`.

**Test:** `npm run smoke` passes. In the browser, the honest flow never warns; opening the scam page makes Lantern speak the warning first and highlight nothing.

---

## Milestone 5 - Demo, Devpost, backup video (everyone, Saturday evening)

**Demo flow (keep this exact script):**
1. On `http://localhost:8787/demo/`, say "Quiero pagar mi factura de luz."
2. Lantern answers in Spanish and highlights **Pay bill**, then the card field, then **Submit payment**.
3. Back on the home page, click the "Special offer" banner. Lantern warns out loud, in Spanish, that the page looks like a scam, before anything is paid.

**Build:** feature freeze at dinner Saturday. Record a 2-minute backup video of the demo flow, write the Devpost (inspiration, what it does, how we built it, challenges), and rehearse the pitch twice.
