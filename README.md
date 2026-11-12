# WARD 13: THE ISOLATION PROTOCOL — NEW INSTALL (v2)

A complete 20-minute multiplayer ESL inference and reference escape-room, including all source files. This is a **new deployment package**, not a patch.

## Quick start

Install Node.js 18 or newer, run `npm start`, then open `http://localhost:3000/teacher`.

1. Enter your teacher email and select **Create session & show QR**.
2. Project the QR code and six-character session code.
3. Students join from their own phones, enter a name, and select the same preset team as the classmates at their table (3–5 per team).
4. Present the nine **Rules Presentation** slides.
5. Select **START LOCKDOWN** to launch the shared 20-minute timer.
6. Monitor the leaderboard and download the CSV statistics from the teacher dashboard.

## Deploy a new instance to Render

1. Create a **new GitHub repository** (recommended: `ward-13-v2`), with all files and folders from this ZIP at the repository root. The root must contain `server.js` and `package.json`; **do not upload the enclosing folder as an extra directory**.
2. In Render: New > Web Service > connect the **new** repository.
3. Runtime **Node**, build command `npm install`, start command `npm start`, choose the **Frankfurt** region if available. The included `render.yaml` provides these defaults for a Blueprint deployment.
4. When Render reports Live, open the service URL followed by `/teacher`.
5. Test one session with at least 3 players on separate devices before classroom use.

**Avoid uploading into the old Ward-13 repository if you want a separate application.** Render assigns a new URL.

## Included features

- Teacher email on entry, creation of a six-character session and self-hosted QR code, live joined-student roster.
- 12 preset team names, 3–5 players, auto-divided clues, 8 puzzles across 4 rooms.
- Clickable Hebrew vocabulary glossary, complete Hebrew translations for main puzzle instructions and 9 rules.
- Challenges, teacher challenges, isolation chamber, bonus-resource theft, points-only leaderboard, time tie-break.
- Live activity log, sortable teacher tables, student response and translation-use analytics, CSV export.
- No required npm dependencies, bundled QR encoder, no external translations API.

## Important operational limits

- **Session persistence:** This version saves session state to a local JSON snapshot on the server. This helps recover from process restarts when filesystem storage survives. On Render Free, files can be wiped on redeploy or instance replacement; use a persistent database before relying on it for high-stakes sessions. For a 20-minute class, avoid deploying while a session runs.
- **Email reports:** Teacher email is stored with the session. CSV download works immediately. Automatic email delivery needs `RESEND_API_KEY` and verified `REPORT_FROM_EMAIL` Render environment variables; without these, no automatic email is sent.
- **Translations:** The bundled Hebrew glossary is curated, **not a guaranteed complete mapping of all CEFR above-A1 terms**. Check and expand it before the classroom session. Underlined instructions open Hebrew full-sentence translations.
- **Graphics:** The game is intentionally readable and non-gory; room scenes are CSS illustrations, not final photorealistic artwork.
- **Analytics:** Team answers are logged for the student pressing submit; face-to-face oral teamwork is not separately measured.
- **Security:** Keep teacher session credentials private. Student names remain in the session and CSV. Do not upload real student personal details to a public code repository.

## Test

Run `npm test` for automated logic tests, and `node smoke-test.js` for local HTTP join/QR/session testing.

## Troubleshooting

- If `/teacher` displays an expired-session message, the page automatically removes the invalid locally saved code and returns to session creation.
- If the session code is missing, enter your email and create a game before sharing links.
- If a team is not ready, verify it has at least 3 joined students.
- If QR is missing, inspect `/api/qr?code=YOURCODE`; it should serve an SVG image.

Third-party QR library notice and attribution are in `qr/LICENSE`.
