# Open Lecture Notes

Public-source, local-first, bring-your-own-key AI lecture note-taking.

## What works now

- Browser microphone capture with local audio chunks stored in IndexedDB.
- Audio/video import for downloaded class recordings, split into provider-sized local chunks.
- Manual transcript entry for testing and imported captions.
- Editable transcript segments before note generation and export.
- Editable generated notes before Markdown, JSON, and Anki export.
- JSON backup export and import for transcript and note portability.
- Local data counts and one-click deletion of all lecture data on the device.
- OpenAI BYOK settings with session-only keys by default.
- Optional passphrase-encrypted key storage using Web Crypto.
- OpenAI transcription and structured note generation adapters.
- Markdown, JSON backup, and Anki CSV export.
- Installable PWA build through `vite-plugin-pwa`.

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
```

## Roadmap

- Add a real offline queue worker with retry/backoff UI.
- Add provider adapters for Gemini, Anthropic-compatible notes, and local transcription.
- Add speaker diarization review and segment editing.
- Add slide/PDF upload and timestamp alignment.
- Add automated browser tests around recording, storage, and export flows.

## License

AGPL-3.0-only.
