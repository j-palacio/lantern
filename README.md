# Lantern — Knight Hacks IX

A voice-first Chrome extension that guides older adults and non-English speakers through websites, step by step, in their own language, and warns them about scams before they pay.

## The problem

Everyday tasks like paying a bill, booking an appointment or filling out a form now happen online. Many older adults and non-English speakers get stuck on confusing sites, and they're also the main targets for online scams.

## What it does

- **Talk to it in your language.** Ask in English, Spanish or another language, and it answers out loud in the same language.
- **Shows you where to click.** It highlights the exact button for the next step and walks you through the task one step at a time.
- **Stops scams.** If a page shows red flags, like "pay with gift cards", urgent threats or a fake domain, it warns you before you pay.
- **You stay in control.** It never clicks, types or enters passwords for you.

## Architecture

```
[Widget on the page]  click / speak
        ↓
[Mic capture]  (extension's own page, for mic permission)
        ↓ audio
[ElevenLabs STT]  →  "Quiero pagar mi factura"
        ↓
[Content script]  reads page → numbered buttons/links
        ↓ text + buttons + page text
[Node backend → Gemini]  picks next step + scam check
        ↓
[Overlay]  highlights button   [ElevenLabs TTS]  speaks reply
              ↘            ↙
         [Visualizer]  reacts to both voices
```

The full contracts live in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Short version:

Extension → backend:

```json
{
  "goal": "pay my electric bill",
  "lang": "es",
  "url": "https://example.com/billing",
  "elements": [{ "id": 7, "text": "Pay now" }],
  "pageText": "..."
}
```

Backend → extension:

```json
{
  "say": "Haz clic en Pagar ahora",
  "highlight": 7,
  "scam": { "risk": "low", "reason": "" },
  "done": false
}
```

## Tech stack

| Part | Choice |
|---|---|
| Extension | Chrome Manifest V3, JS/TS |
| Page reading | Numbered clickable elements from the page + screenshot |
| Backend | Node.js |
| LLM | Gemini (Flash) with strict JSON output |
| Voice | ElevenLabs speech-to-text and text-to-speech |
| Scam check | Gemini on page text/URL + red-flag rules |
| Visualizer | Web Audio API + canvas |

## Team

| Area | Owner |
|---|---|
| Voice pipeline (mic, STT, TTS, languages), latency, visualizer | J |
| Node backend + Gemini next-step logic | TBD |
| Content script, highlighting, overlay/widget | TBD |
| Scam check, demo pages, Devpost, backup video | TBD |

## How we're building it

We're following the workflow the Pointr team used to win ShellHacks:

1. **Plan by hand first (~2-3 h).** Sketch the flow on paper and write notes in [`docs/NOTES.md`](docs/NOTES.md), in our own words, before asking AI for anything.
2. **Get grilled (~1-2 h).** Hand the notes to Claude Code with the [grill-me skill](https://github.com/mattpocock/skills) and let it attack our assumptions. See [`docs/GRILL.md`](docs/GRILL.md).
3. **Write milestones.** Turn the grilling into ~6 milestones, each with implementation details and a test, in [`docs/MILESTONES.md`](docs/MILESTONES.md).
4. **Build one milestone per clean session.** Each milestone goes to a fresh Claude Code session. When it's done, update `CLAUDE.md` and `notes/PROGRESS.md`.
5. **Sleep.** Pointr finished in under 12 hours of work.

## Demo flow

1. User says "Quiero pagar mi factura de luz."
2. The assistant answers in Spanish and highlights the right button.
3. The user clicks a fake scam link, and the assistant warns them out loud before they pay.

## Inspiration and references

- **Pointr** (ShellHacks 2026, 1st place) — [Devpost](https://devpost.com/software/pointr-0ce2gh) · [GitHub](https://github.com/edwin-luu/pointr). Web-guide overlay with Set-of-Marks prompting. Their `CLAUDE.md` and `docs/ARCHITECTURE.md` are a good model for ours.
- **Accent** (LA Hacks 2026, Light The Way track) — [Devpost](https://devpost.com/software/accent-cdw2qi) · [GitHub](https://github.com/RyloRiz/accent). macOS assistant with ElevenLabs voice in/out and Gemini intent resolution.

We read these for ideas only. All code in this repo was written during Knight Hacks.
