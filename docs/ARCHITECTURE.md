# Lantern - Architecture

How Lantern works, the decisions behind it, and the exact data contracts between its parts. Contracts in section 6 are binding: code on both sides of a message or HTTP call follows them exactly. Code comments refer to this file by section number.

## 1. Product in one paragraph

A user who is unsure how to use a website presses the Lantern button (bottom-right, or `Alt+L`) and says ONE goal out loud, in any language ("quiero pagar mi factura de luz"). Lantern looks at the current screen, decides the single next action, highlights the right element, and says what to do out loud in the language the user spoke. When the user does it, Lantern looks again and gives the next step, until the goal is done. On every step it also checks the page for scam red flags, and if the risk is high it warns the user out loud before anything else. Lantern never clicks, types or enters passwords for the user.

## 2. Decisions (and why)

| # | Decision | Why |
|---|----------|-----|
| D1 | Chrome extension, Manifest V3, plain JS, no build step | Reads the DOM so highlights are pixel-exact; edit, reload in `chrome://extensions`. |
| D2 | Small local backend, Node 20+, plain JS, `node:http`, zero dependencies | Keeps every API key off the client, one place to swap models and prompts. |
| D3 | Gemini for decisions, strict JSON output. Model set in `server/.env` (`GEMINI_MODEL`) | Fast, multimodal, multilingual. |
| D4 | ElevenLabs for both speech-to-text and text-to-speech, **always called by the backend** (`/transcribe`, `/speak`) | The extension never holds a key. STT also returns the spoken language, so there is no language picker. |
| D5 | Set-of-Marks grounding (same as Pointr): a screenshot with a number drawn on every element + the numbered list; the model answers with one number | The model never guesses coordinates. |
| D6 | One step at a time, **event-driven, never time-polled** (section 5) | A model call happens only when something meaningful happens. Cheaper and faster. |
| D7 | Scam check rides inside `/decide` (section 11). Fast rules first, Gemini second | No extra round trip; rules give the same answer every time, which keeps the demo reliable. |
| D8 | Mic recording and audio playback live in an **offscreen document** | Mic permission is granted once for Lantern, never per website; playback is not blocked by page autoplay rules. |
| D9 | Session state in the service worker + `chrome.storage.session`, keyed by tab id | Survives page loads and redirects. |
| D10 | All Lantern UI inside a closed Shadow DOM on `<lantern-root>` | Page CSS cannot break our UI and vice versa. |
| D11 | The element list never includes field values (only `hasValue`) | Privacy. |
| D12 | Wrong clicks are never blocked; Lantern re-plans from the new screen toward the original goal | Real users detour; blocking breaks real sites. |

Out of scope this weekend: wake word, iframes, acting on the user's behalf.

## 3. Components

```
+----------------------------- Chrome ------------------------------------+
|  CONTENT SCRIPT (every page, UI in closed Shadow DOM on <lantern-root>) |
|   config.js   tunables                                                  |
|   scanner.js  visible interactive elements -> ElementInfo[]             |
|   overlay.js  highlight ring + caption                                  |
|   watcher.js  detects the user's action -> Outcome                      |
|   widget.js   round button, status, mic state, Stop                     |
|   main.js     message wiring (LAST in the manifest list)                |
|                  ^            |  chrome.runtime messages (6.3)           |
|                  |            v                                          |
|  SERVICE WORKER background.js (ES module)                               |
|   sw/session.js  per-tab Session in chrome.storage.session              |
|   sw/loop.js     observe -> think -> point -> wait state machine        |
|   sw/marks.js    captureVisibleTab + draw numbered boxes                |
|   sw/api.js      POST /decide                                           |
|   sw/voice.js    offscreen document lifecycle, Alt+L                    |
|  OFFSCREEN offscreen/  mic -> /transcribe, /speak -> plays audio         |
|  WELCOME   welcome/    asks for the mic once on install                 |
+--------------------------------------------------------------------------+
                         | HTTP (localhost:8787)
+------------------------v-------------------------------------------------+
|  BACKEND server/                                                         |
|   server.js   routes, CORS-free (host permission), .env loading          |
|   decide.js   prompt -> Gemini -> validate -> DecideResponse             |
|   prompt.js   system prompt + request -> Gemini parts                    |
|   scam.js     red-flag rules -> flags[] (fed into the prompt)            |
|   voice.js    ElevenLabs STT (/transcribe) and TTS (/speak)              |
+--------------------------------------------------------------------------+
```

## 4. Repository layout

```
extension/   Chrome extension (Manifest V3, plain JS, no build step)
server/      Node backend (plain JS, zero dependencies)
demo/        Demo pages, including a fake scam bill-pay page
docs/        ARCHITECTURE.md (this file), MILESTONES.md (who builds what)
```

## 5. The step loop (`sw/loop.js`)

```
        LANTERN_START {goal, lang}
                 |
                 v
   +------> OBSERVING   SW -> content: LANTERN_SCAN (content hides Lantern UI, scans, replies ScanResult)
   |             |      SW: captureVisibleTab + draw marks, then content un-hides UI
   |             v
   |         THINKING   SW: POST /decide       widget: "Looking..."
   |             |
   |      response.done ----------------------> DONE: LANTERN_DONE {say}; speak; clear session
   |             |
   |             v
   |    AWAITING_ACTION SW -> content: LANTERN_STEP {turn, step, scam}; SW asks offscreen to speak
   |             |      content: overlay highlights, watcher armed
   |             |
   |   content -> SW: LANTERN_STEP_RESULT {turn, outcome}
   |             v
   |         SETTLING   waits for content -> SW: LANTERN_READY {turn} (DOM quiet)
   |             |      or LANTERN_HELLO {url} (a new page loaded)
   +-------------+
```

Rules:
- The screenshot is taken while Lantern's UI is hidden, so the model never sees our own widget.
- Every turn-scoped message carries `turn`. The SW ignores a `LANTERN_STEP_RESULT`/`LANTERN_READY` whose `turn` does not match.
- `LANTERN_HELLO` while `awaiting_action` -> record `page_changed` and run the next turn; while `settling`, `observing` or `thinking` -> run the turn again on the new page.
- `LANTERN_STOP` clears the session from any state.
- Errors (backend down, timeout): `LANTERN_STATUS {status: "error", text}`; the widget shows the message in red.
- Max 30 turns, then stop with a friendly message.
- `captureVisibleTab` is rate-limited to 2 calls/s: never call it twice within 600 ms.

## 6. Contracts (binding)

### 6.1 Shared types

```js
// ElementInfo - one numbered element (scanner.js -> SW -> backend)
{ id: 7, role: "button", text: "Pay now", hasValue: false,
  rect: { x: 812, y: 430, w: 120, h: 40 } }   // viewport CSS pixels

// PageInfo
{ url: "https://example.com/billing", title: "Billing", text: "...",   // visible text, max 4000 chars
  viewport: { width: 1280, height: 720, dpr: 2 } }

// HistoryEntry - what happened on earlier turns (max 10, oldest first)
{ turn: 2, say: "Click Pay now", highlight: 7, outcome: "completed" }

// Outcome
"completed" | "clicked_elsewhere" | "page_changed" | "target_covered"

// Scam
{ risk: "low" | "medium" | "high", reason: "" }   // reason in the user's language
```

### 6.2 Backend HTTP API (`http://localhost:8787`)

`GET /health` -> `{ "ok": true, "gemini": true|false, "elevenlabs": true|false }` (whether each key is set).

`POST /decide` (JSON, max 8 MB)

```js
// request
{
  "goal": "pay my electric bill",
  "lang": "es",                       // ISO 639-1, from /transcribe
  "turn": 3,
  "page": PageInfo,
  "elements": [ElementInfo],          // max 150
  "history": [HistoryEntry],
  "screenshot": "<base64 JPEG, no data: prefix, marks drawn, max width 1280>"
}
// response, success
{
  "say": "Haz clic en Pagar ahora",   // short, in `lang`
  "highlight": 7,                     // an element id from the request, or null
  "scam": { "risk": "low", "reason": "" },
  "done": false
}
// response, failure (HTTP 200)
{ "error": "gemini_timeout", "retryable": true }
```

- `highlight` must be an id from the request; otherwise the server retries Gemini once, then answers `highlight: null` with a "try scrolling or tell me more" line.
- On `scam.risk == "high"` the extension speaks the warning first and does NOT highlight a pay/submit button. The user stays in control.

`POST /transcribe`: body = raw audio bytes (`Content-Type: audio/webm`), max 5 MB.
Response `{ "text": "quiero pagar mi factura", "lang": "es" }` or `{ "error": "..." }`.

`POST /speak`: JSON `{ "text": "...", "lang": "es" }`.
Response: `audio/mpeg` bytes, or JSON `{ "error": "..." }` with HTTP 502.

### 6.3 Extension messages (`chrome.runtime`)

| Message | From -> To | Payload | Reply |
|---|---|---|---|
| `LANTERN_START` | content -> SW | `{goal, lang}` | `{ok}` |
| `LANTERN_STOP` | content -> SW | `{}` | `{ok}` |
| `LANTERN_VOICE` | content -> SW | `{}` (toggle record) | `{ok}` |
| `LANTERN_HELLO` | content -> SW | `{url}` | session summary or `null` |
| `LANTERN_STEP_RESULT` | content -> SW | `{turn, outcome}` | - |
| `LANTERN_READY` | content -> SW | `{turn}` | - |
| `LANTERN_SCAN` | SW -> content | `{}` | `{page, elements}` (UI hidden until `LANTERN_SHOW_UI`) |
| `LANTERN_SHOW_UI` | SW -> content | `{}` | - |
| `LANTERN_STATUS` | SW -> content | `{status, text}` (listening, thinking, error) | - |
| `LANTERN_STEP` | SW -> content | `{turn, step: {say, highlight, scam}}` | - |
| `LANTERN_DONE` | SW -> content | `{say}` | - |
| `OFFSCREEN_RECORD_START` | SW -> offscreen | `{}` | `{ok}` |
| `OFFSCREEN_RECORD_STOP` | SW -> offscreen | `{}` | `{text, lang}` or `{error}` |
| `OFFSCREEN_SPEAK` | SW -> offscreen | `{text, lang}` | `{ok}` |

## 7. Scanner rules (`content/scanner.js`)

- Candidates: `a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=link], [role=tab], [role=menuitem], [onclick], [tabindex]:not([tabindex="-1"])`.
- Keep only visible elements inside the viewport (non-zero rect, not `visibility:hidden`, opacity > 0).
- `text` = aria-label, then visible text, then placeholder/title/alt, trimmed to 80 chars.
- Ids are assigned top-to-bottom, left-to-right, starting at 1. The id -> element map stays in memory in the content script (no attributes are written into the page).
- Lantern's own UI is never scanned.

## 8. Set-of-Marks drawing (`sw/marks.js`)

1. `captureVisibleTab(windowId, {format: "jpeg", quality: 80})`.
2. Draw it on an `OffscreenCanvas` scaled to max width 1280; for each element a 2 px box and a numbered tag in the box's color.
3. Encode JPEG quality 0.8 -> base64 without prefix.

## 9. Overlay (`content/overlay.js`)

A thick ring around the target, the rest of the page lightly dimmed, and a caption with the spoken text. On `scam.risk == "high"` the caption turns red and shows the warning. The overlay follows the target on scroll and resize.

## 10. Watcher rules (`content/watcher.js`)

Armed per step. The first matching rule reports ONE outcome via `LANTERN_STEP_RESULT`, clears the overlay, then waits for the page to settle and sends `LANTERN_READY {turn: turn + 1}`.

| Event | Outcome |
|---|---|
| Click inside the target (or `change` on a select/checkbox target) | `completed` |
| Click on a different interactive element | `clicked_elsewhere` |
| URL change, or target removed from the page | `page_changed` |
| Something covers the target for 400 ms | `target_covered` |

Settled = no DOM changes for 400 ms (max 2.5 s). If the page navigates, the new page's `LANTERN_HELLO` takes over.

## 11. Scam check (`server/scam.js` + prompt)

Runs inside every `/decide` call.

1. **Rules** (instant, deterministic) produce `flags[]`:
   - asks for gift cards, wire transfer, crypto, or payment apps to strangers
   - urgent threats ("account suspended", "pay within 24 hours", "arrest")
   - lookalike domain (brand name in the page but a different registered domain, extra words like `-secure-pay`, digits for letters)
   - card or password field on a page that is not `https`
2. **Gemini** gets the page plus `flags[]` and returns `scam.risk` and `scam.reason` in the user's language.
3. Two or more rule flags force `risk >= "medium"`; a gift-card or crypto payment request forces `"high"`.

## 12. Voice pipeline

`Alt+L` or the mic in the widget:
1. SW makes sure the offscreen document exists and sends `OFFSCREEN_RECORD_START`; widget shows "Listening...".
2. Pressing again sends `OFFSCREEN_RECORD_STOP`; offscreen stops `MediaRecorder` (`audio/webm`), POSTs to `/transcribe`, replies `{text, lang}`; SW starts the goal with that language.
3. Every step's `say` (and scam warnings) goes to `OFFSCREEN_SPEAK` -> `/speak` -> plays the MP3. A new step stops any audio still playing.
4. Mic permission: on install, `welcome/welcome.html` asks for the mic once.
5. Typing a goal in the widget also works (lang defaults to the browser language).
