# Architecture

How Lantern works and the exact data contracts between its parts. Contracts in section 3 are binding: code on both sides of an HTTP call follows them exactly.

## 1. Components

| Component | Runs in | Job |
|---|---|---|
| Widget | Content script | Button to start talking; shows status |
| Mic capture | Extension page (offscreen / popup) | Gets mic permission, records audio |
| STT | ElevenLabs (via backend) | Audio → text + detected language |
| Page scanner | Content script | Numbers every visible button, link and field |
| Decide | Node backend → Gemini | Picks the next element and what to say |
| Scam check | Node backend → Gemini + rules | Flags risky pages before payment |
| Overlay | Content script | Highlights the chosen element |
| TTS | ElevenLabs (via backend) | Speaks the reply in the user's language |
| Visualizer | Widget | Animates to the user's voice and the reply |

## 2. Flow

```
speak → STT → scan page → POST /decide → highlight + speak → user clicks → scan again → ... → done
```

## 3. Contracts (law)

### POST /decide

Request (extension → backend):

```json
{
  "goal": "pay my electric bill",
  "lang": "es",
  "url": "https://example.com/billing",
  "elements": [{ "id": 7, "text": "Pay now" }],
  "pageText": "..."
}
```

Response (backend → extension):

```json
{
  "say": "Haz clic en Pagar ahora",
  "highlight": 7,
  "scam": { "risk": "low", "reason": "" },
  "done": false
}
```

- `highlight` is an element `id` from the request, or `null`.
- `scam.risk` is `"low" | "medium" | "high"`. On `"high"`, the extension speaks the warning before anything else.

### Open questions

- STT/TTS endpoints: does the backend proxy ElevenLabs, or does the extension call it with a short-lived token?
- Do we send a screenshot (Set-of-Marks, like Pointr) or text only?
- How does the extension notice the user acted, and when does it re-scan?
