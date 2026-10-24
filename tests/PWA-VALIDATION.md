# PWA validation — 2026-10-24

## Repository findings

- The tested checkout is `EyeCare-AI-PWA`, branch `main`, at commit `d17f1f3`, tracking `origin/main`.
- The Git-tracked source contains 19 HTML entry points: root `index.html` plus 18 pages, including `pages/letter-vision-test.html`.
- `origin/main` contains no tracked `.github` workflow, `CNAME`, `_config.yml`, or `.nojekyll`. An authenticated GitHub API check on 2026-10-24 confirmed Pages uses legacy branch deployment from `main` at repository root, with URL `https://zaid-alatrash.github.io/EyeCare-AI/`.
- All pre-existing PWA files were untracked. They were reviewed against this restored source; the missing letter-test page/assets were added to the safe public cache allowlist, and corrupted Arabic install text was repaired.
- `tatus --short` contained only terminal/Git warning output and was removed after verification.

## Executed checks

- `node tests/pwa.test.js` — passed:
  - manifest name/colors/display;
  - 192×192, 512×512, maskable 512×512, and Apple 180×180 PNG dimensions;
  - PWA metadata on all 19 HTML entries;
  - relative resolution at both `/` and `/EyeCare-AI/`;
  - actual service-worker install/activate/fetch handlers in isolated cache mocks;
  - public allowlist, offline fallback, non-GET/external/auth/private/query exclusions, and scoped obsolete-cache cleanup.
- `node tests/pwa-browser.test.js` — passed in a dedicated headless Edge profile stored under the OS temporary directory:
  - registration from a nested page;
  - correct scopes at `/EyeCare-AI/` and `/`;
  - parsed manifest with no Edge installability errors;
  - conditional one-use install prompt;
  - offline public-page cache and restricted-page fallback;
  - no history/API entry in Cache Storage;
  - waiting update activation, old EyeCare cache cleanup, and preservation of unrelated cache/localStorage.
- `node tests/pwa-regression.test.js` — passed using its own temporary local server on port `8767`:
  - existing browser smoke suite;
  - desktop/mobile interactive examination smoke suite;
  - Arabic PDF generation with output redirected to ignored `tmp/`.
- Existing logic tests passed:
  - `speech-recognition.test.js`
  - `letter-vision-test.test.js`
  - `vision-realtime.test.js`
  - `eye-tracking-engine.test.js`
  - `eye-tracking-ui.test.js`
  - `prototype-pages.test.js`
- Syntax checks passed for `sw.js`, `js/pwa.js`, and the PWA/browser test runners. `git diff --check` passed.

No real microphone, physical camera, physical Android/iPhone installation, iOS Safari runtime, post-release live PWA deployment, or full offline medical examination was tested. No claim is made that Web Speech, MediaPipe models, camera tests, uploads, history, or reports work offline.

## Run the browser checks on Windows

Use a dedicated Edge profile in the operating system's temporary directory, never Downloads or the repository:

```powershell
$profile = Join-Path $env:TEMP ("EyeCare-PWA-Test-" + [guid]::NewGuid().ToString("N"))
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$browser = Start-Process $edge -WindowStyle Hidden -PassThru -ArgumentList @(
  "--headless=new",
  "--remote-debugging-port=9223",
  "--user-data-dir=$profile",
  "--no-first-run",
  "--no-default-browser-check",
  "about:blank"
)

node tests/pwa-browser.test.js
node tests/pwa-regression.test.js

taskkill /PID $browser.Id /T /F
Remove-Item -LiteralPath $profile -Recurse -Force
```

Only remove the unique profile path created by that command. The tests do not use or modify the normal Edge profile.

## Cache and privacy boundaries

The service worker uses a versioned, repository-scope-specific cache. It caches only explicit public HTML/CSS/JS/image/font files. It does not cache portal/history/messages/appointments pages, uploads, blob URLs, generated reports, API routes, cross-origin dependencies, non-GET requests, authorization-bearing requests, or responses marked private/no-store/Set-Cookie.

Public examination shells can be available offline, but camera, Web Speech, external MediaPipe resources, and any future backend remain connection/browser dependent. The offline fallback states this limitation.
