# Open Lecture Notes

Public-source, local-first, bring-your-own-key AI lecture note-taking.

## What works now

- Browser microphone capture with local audio chunks stored in IndexedDB.
- Audio/video import for downloaded class recordings, split into provider-sized local chunks.
- Local slide/PDF/image/text material attachments with transcript segment matching for searchable text.
- Manual transcript entry for testing and imported captions.
- Editable transcript segments before note generation and export.
- Speaker label review on transcript segments before notes and export.
- Editable generated notes before Markdown, JSON, and Anki export.
- In-app flashcard review for generated study cards.
- JSON backup export and import for transcript and note portability.
- Local search across lecture titles, transcript text, generated notes, and flashcards.
- Course creation, active-course selection, and course-scoped lecture library search.
- Local data counts and one-click deletion of all lecture data on the device.
- Persistent local provider queue with retry controls for transcription and note generation.
- OpenAI-compatible BYOK settings with configurable `/v1` base URL and session-only keys by default.
- Optional passphrase-encrypted key storage using Web Crypto.
- OpenAI audio transcription plus Responses API and chat-completions JSON note generation adapters.
- Markdown, JSON backup, and Anki CSV export.
- Installable PWA build through `vite-plugin-pwa`.
- Browser smoke coverage for lecture creation, transcript storage, material linking, and JSON export.

## Privacy posture

The app has no hosted account system and stores lecture data in the browser's IndexedDB. Provider API keys are session-only unless the user explicitly encrypts one with a local passphrase. Browser storage is not a high-security vault; users should treat client-side BYOK as convenient, not secret from the local browser runtime or malicious extensions.

## Recording posture

Users must confirm they have permission to record before capture starts. Recording rules vary by location, school, and class policy. This project is not legal advice and does not bypass institutional requirements.

## Development

```powershell
npm install --legacy-peer-deps
npm run dev
npm test
npm run build
npm run test:browser
```

## Roadmap

- Add first-class Gemini, Anthropic-native notes, and local transcription adapters.
- Add automatic speaker diarization suggestions.
- Add deeper PDF/slide text extraction and timestamp alignment.
- Expand automated browser tests around recording and provider queue flows.

## License

AGPL-3.0-only.
