# Milestones

The skeleton already runs end to end with mock data: type a goal, Lantern scans the page, takes a numbered screenshot, asks `/decide`, highlights a button, notices your click, and gives the next step. Each milestone below replaces one mock or rough part with the real thing. They touch different files, so everyone can work at the same time.

## How to work a milestone

1. `git checkout -b m<N>-<short-name>` (for example `m2-gemini`).
2. Open a **fresh** Claude Code session in the repo and paste:

   > Read CLAUDE.md, docs/ARCHITECTURE.md, and Milestone N in docs/MILESTONES.md. Build only Milestone N. Do not change any contract in ARCHITECTURE.md section 6 without asking me. When it passes its tests, tell me what changed.

3. Test it the way the milestone says, push your branch, and open a pull request. J merges.

API keys: copy `server/.env.example` to `server/.env` and add your own free Gemini key from aistudio.google.com/apikey. Never commit `.env` or paste keys in chat. Only Milestone 1 needs ElevenLabs; without it Lantern uses the browser's voice.

| # | Milestone | Owner | Status |
|---|---|---|---|
| 1 | Real voice: ElevenLabs STT + TTS, live levels | J | Done (needs real keys to try) |
| 2 | Real decisions: Gemini, validation, prompt | Andrew (@abSWU) | Not started |
| 3 | Overlay, widget, scanner polish + voice orb visualizer | Juan (@juanlopolicaarpio) | Not started |
| 4 | Scam check rules + demo pages | Xiangtao (@PineXW3) | Not started |
| 5 | Demo script, Devpost, backup video | Everyone | Saturday evening |

---

## Milestone 1 - Real voice (J)

**Goal:** speak a goal in English or Spanish, hear every step read back in the same language with ElevenLabs.

**Files:** `server/voice.js`, `extension/offscreen/offscreen.js`, `server/scripts/voice-test.js`.

**Build:**
- `transcribe()`: ElevenLabs speech-to-text from the webm bytes; return `{text, lang}` with `lang` as ISO 639-1 (map 3-letter codes like `spa` -> `es`).
- `speak()`: ElevenLabs text-to-speech with `ELEVENLABS_VOICE_ID` and a low-latency multilingual model; return the MP3 bytes.
- Keep the built-in browser voice fallback in `offscreen.js` for when the key is missing or the call fails.
- Live volume levels for the visualizer: `LANTERN_LEVEL {source, level}` reaches the page ~20 times a second while the user or Lantern is talking (ARCHITECTURE section 12, item 7).
- Log how long each call takes; aim for under 1.5 s from "done talking" to the first highlight.

**Status:** built and tested against a fake ElevenLabs server (`npm run test:voice`) and end to end in Chrome. Still to do with real keys: try it, check latency, pick the voice.

**Test:** with keys in `server/.env`, press `Alt+L`, say "quiero pagar mi factura de luz", press again. The widget shows the goal, the step is spoken in Spanish. Pull the key: Lantern still speaks with the browser voice.

---

## Milestone 2 - Real decisions (Andrew)

**Goal:** Gemini picks the right button reliably on the demo pages and on one real site.

**Files:** `server/decide.js`, `server/prompt.js`.

**Build:**
- Run with a real `GEMINI_API_KEY` and fix whatever breaks.
- Validation (section 6.2): if `highlight` is not an id from the request, retry once with the note "Element N does not exist. Pick from the list."; still wrong -> `highlight: null` with a "try scrolling, or tell me more" line in the user's language.
- Use `history` so Lantern does not repeat a step the user already did.
- Tune the prompt until the demo flow (section "Demo flow" in Milestone 5) is right 9 times out of 10. Write down accuracy and the average `/decide` time.

**Test:** `npm run smoke` passes. Then run the demo flow on `http://localhost:8787/demo/` 10 times with the real key and count correct steps.

---

## Milestone 3 - Overlay, widget and scanner polish (Juan)

**Goal:** it looks great and never points at the wrong thing.

**Files:** `extension/content/overlay.js`, `extension/content/widget.js`, `extension/content/visualizer.js` (new), `extension/manifest.json` (add visualizer.js before main.js), `extension/content/scanner.js`, `extension/sw/marks.js`, `extension/sw/loop.js` (background-tab pause only).

**Build:**
- Overlay: smooth movement, a clear arrow or cursor toward the target, caption that never covers the target, big readable text (consider the Atkinson Hyperlegible font).
- Widget: clean idle / listening / thinking / guiding / done / error states; Stop always works.
- Voice orb visualizer (like ChatGPT's voice mode): new `content/visualizer.js` that defines `L.visualizer = { update(source, level) }` and draws an orb in the widget that breathes when idle, follows the user's voice (`source: "user"`) and Lantern's voice (`source: "lantern"`). Levels already arrive ~20/s via `LANTERN_LEVEL`; no mic code needed. Plain JS + canvas (no React, no build step). Reference: the vanilla Canvas + Web Audio "Voice Reactive Orb" pen https://codepen.io/Dvk21/pen/WbQKwdE (layered blurred gradient blobs) and orb-ui https://github.com/alexanderqchen/orb-ui (MIT, React; good reference for idle/listening/speaking states).
- Number tags in `marks.js` must never cover a neighbouring element (see Pointr's ARCHITECTURE section 8 for a good placement rule).
- Scanner: test on two real sites (an airline or a bank login page); fix missed or duplicated elements.
- If the guided tab goes to the background, pause the turn and resume on `chrome.tabs.onActivated`.

**Test:** load the extension, run the demo flow, and screenshot every state. Check a real site's numbered screenshot (add a temporary `console.log` of the image size or save it once) to confirm no tags overlap.

---

## Milestone 4 - Scam check + demo pages (Xiangtao)

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
