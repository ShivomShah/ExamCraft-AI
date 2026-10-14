EXAMCRAFT AI — LIVE PREVIEW + AUTOMATIC GEMINI MODEL SELECTION

WHAT CHANGED IN THIS ZIP
- Subject, duration, marks, difficulty and section counts update the live draft
  immediately. Draft question slots are replaced by real questions after generation.
- Generating status, spinner, elapsed time, Cancel and persistent errors appear
  below Generate and beside the preview. Online MCQ generation has matching status.
- Gemini models are discovered from the API instead of assuming 2.5 Flash exists
  for every project. Limited fallback handles missing models or temporary 5xx errors.
- Formatted source, existing Supabase login and the corrected backend script
  insertion are retained. Editing details after generation shows a fresh draft;
  the previously generated paper is not silently rewritten or exported as the draft.
- You do not need to reconnect the frontend, login or backend manually.

Keep your existing project as a backup. Extract this ZIP into a new folder.
The existing HTML design is preserved. app.py adds backend.js when
serving the page. Do not open the HTML by double-clicking it for AI features.

1. Copy your existing .env file into this folder, beside app.py.
   If you do not have one yet, copy .env.example and rename the copy to .env.
   It needs only these two lines:

   GEMINI_API_KEY=YOUR_ACTUAL_KEY
   GEMINI_MODEL=auto

   IMPORTANT: If you copied an older .env, change its GEMINI_MODEL line to auto.
   Keep your own GEMINI_API_KEY. Restart the server after saving .env.

   .env.example is only a template. Do not paste keys into HTML/JavaScript.
   Do not send your .env file to anyone or include it in a shared ZIP.

2. Stop your old server: click its terminal and press Ctrl+C.

3. Open this extracted folder in VS Code. Open Terminal > New Terminal.
   Install dependencies once:

   py -m pip install -r requirements.txt

4. Start the app:

   py app.py

5. Open exactly:
   http://localhost:8000/FINALV2.html

   Keep the terminal open. It is a running server, not a stuck installation.
   After initial setup, you can also double-click START.bat to start it.
   Use localhost consistently rather than switching to 127.0.0.1, so browser
   sessions/history stay on the same origin.

6. Log in. Create Paper: upload one PDF or several study images. Enter a
   subject, duration, marks, and your chosen question counts. Start with
   3–5 questions to check your key and model access. The draft updates as you type.
   Click Generate; progress is shown below the button and next to the preview.

7. Online Test: choose PDF / images, upload your material, enter MCQ count
   and time per question, then Generate & Start Test. Built-in topic practice
   remains available independently of Gemini.

8. Question Paper / Answer Key export opens a print view. Click Print / Save
   as PDF and choose Save as PDF. Allow pop-ups for localhost if needed.

LIMITS AND CURRENT BEHAVIOR
- One PDF (up to 1000 pages) OR 1–8 JPG/PNG/WebP images; 50 MB combined.
- All uploaded images are considered together. Clear text works best.
- 1–50 questions per generation; set 0 for types you do not want.
- Source references appear in answer keys. Always review AI output.
- Material is sent to Google's Gemini service when you click Generate.
  Temporary PDFs uploaded through the Files API are deleted after the request
  when possible. Images are included directly in the generation request.
- Login uses your existing Supabase project. The backend verifies login before
  using your Gemini key. No service-role key or database password is needed.
- Papers and results still use account-specific browser storage, not cloud DB.
  Browser storage is not secure shared-computer storage. Cloud sync and database
  row-level security are a future step.
- This is a local application bound to 127.0.0.1, not a production deployment.
- Cancel stops waiting in the browser. A call already sent to Gemini may still
  consume quota. Avoid repeated clicks during a slow generation.
- Auto selection prefers a stable Flash-Lite candidate, then other listed
  general-purpose Flash models. Specialized audio/image-generation and Pro
  endpoints are excluded. At most three different models are tried per generation;
  a sole model can receive one retry after a temporary server error.
- An explicit GEMINI_MODEL is a preference: if unavailable, compatible listed
  candidates are used. Listing a model does not guarantee generation access or quota.
- Quota (429), key/access errors and invalid requests stop without cycling models.
  Free/paid usage depends on your Google project; this app does not change billing.
- Progress uses actual elapsed time, not an invented completion percentage.

TROUBLESHOOTING
- Address already in use: stop the previous server with Ctrl+C.
- 404 or no AI upload controls: run py app.py, NOT py -m http.server. Open the
  exact URL above. Hard-refresh with Ctrl+F5 if necessary.
- Missing module: rerun the dependency command using the same py launcher.
- Missing API key: confirm the filename is .env (not .env.txt), placed beside
  app.py. Restart the backend after changing .env.
- Model unavailable (404): set GEMINI_MODEL=auto and restart. The app lists
  compatible candidates and tries alternatives for unavailable models. Google
  currently limits Gemini 2.5 access for projects without prior active use.
  If the problem continues, run: py app.py --check-models
  This prints candidate names without printing your key. It does not guarantee
  quota or generation permission. Check project access in Google AI Studio.
- Busy (503): limited alternatives/retries run automatically. If all fail, wait
  and retry; your paper settings and selected files remain in the current page.
- Quota (429): check the project's API quota; retry when allowed. Extra keys in
  the same project do not provide a separate quota.
- Email verification/reset redirect: Supabase Authentication URL Configuration
  should allow http://localhost:8000/FINALV2.html for your local development.
- Do not run a generic directory server in this folder: it can expose .env.

VALIDATION
Local checks cover live metadata/section updates, visible loading and elapsed
time, successful preview, edits after generation, errors, cancellation/retry,
MCQ progress and logout cleanup. Model tests cover discovery/filtering, stale
model preferences, unavailable/busy fallback, bounded retries, token limits,
single PDF upload with cleanup, and stopping on quota/key/access failures.
External responses were simulated; no real credentials or live Supabase/Gemini
generation were used. Test actual sign-in and generation with your own account.

Official API references used for integration:
https://ai.google.dev/api/generate-content
https://ai.google.dev/api/models
https://ai.google.dev/gemini-api/docs/models
https://ai.google.dev/gemini-api/docs/troubleshooting
https://ai.google.dev/api/files
https://supabase.com/docs/reference/javascript/auth-getuser
