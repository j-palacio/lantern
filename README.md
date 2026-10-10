# Lantern

**A patient guide for the web, in your language.** Tell Lantern one goal out loud ("quiero pagar mi factura de luz"), and it shows you where to click, one step at a time, on the real website: the right button lights up and Lantern tells you what to do, out loud, in the language you spoke. You do the clicking; Lantern looks again after every action until the goal is done. If the page looks like a scam, it warns you before you pay.

Built at Knight Hacks IX for people who find websites hard to use and are the main targets of online scams: older adults, non-English speakers, anyone who freezes at a screen full of buttons.

## What it does

- **Talk to it in your language.** Ask in English, Spanish or another language, and it answers out loud in the same language.
- **One goal, step by step.** Lantern plans a single next step from what is on the screen right now and highlights the exact button for it.
- **Stops scams.** If a page shows red flags, like "pay with gift cards", urgent threats or a fake domain, it warns you out loud before you pay.
- **You stay in control.** It never clicks, types or enters passwords for you.

## How it works

```
 Chrome                                             Backend
+--------------------------------------+          +-----------------------------------+
| Content script (every page)          |          | server/  (Node)                   |
|  scanner -> numbered element list    |          |   POST /decide -> Gemini          |
|  overlay -> highlight the next step  |   HTTP   |     next step + scam check        |
|  widget  -> talk button, visualizer  | <------> |   speech-to-text -> ElevenLabs    |
| Service worker: step loop            |          |   text-to-speech -> ElevenLabs    |
| Offscreen document: mic              |          |                                   |
+--------------------------------------+          +-----------------------------------+
```

Each step: the extension numbers every button, link and field on the page and sends the list, the page text, the user's goal and their language to the backend. Gemini answers with ONE element number, a short instruction and a scam rating; the extension highlights that element and ElevenLabs speaks the instruction. Details and contracts: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it

Requirements: Node 20.12+, Google Chrome, a Gemini API key and an ElevenLabs API key (both optional for a first try: without them Lantern uses mock steps and the browser's built-in voice).

1. **Keys.** Copy `server/.env.example` to `server/.env` and fill in `GEMINI_API_KEY`, `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID`. `.env` is gitignored; never commit it.
2. **Backend.** `cd server && npm run dev`. The startup line says which parts are real and which are mocked.
3. **Extension.** In Chrome open `chrome://extensions`, turn on Developer mode, click **Load unpacked** and pick the `extension/` folder. A welcome tab opens: click **Allow microphone** once.
4. **Try it.** Open `http://localhost:8787/demo/`, click the round Lantern button (bottom right) or press **Alt+L**, and say or type "pay my bill".

Check the backend with `cd server && npm run smoke` while it is running.

## Repository

```
extension/   Chrome extension (Manifest V3, plain JS, no build step)
server/      Node backend: Gemini decisions, scam check, ElevenLabs voice (zero dependencies)
demo/        Demo pages, served at http://localhost:8787/demo/
docs/        ARCHITECTURE.md (design + contracts), MILESTONES.md (who builds what)
```

## Built with

Chrome Extensions (Manifest V3), Google Gemini API, ElevenLabs, Node.js.

## Inspiration

[Pointr](https://github.com/edwin-luu/pointr) ([Devpost](https://devpost.com/software/pointr-0ce2gh), 1st place at ShellHacks 2026) and [Accent](https://github.com/RyloRiz/accent) ([Devpost](https://devpost.com/software/accent-cdw2qi), LA Hacks 2026). All code in this repo was written during Knight Hacks.
