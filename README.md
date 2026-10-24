# EyeCare AI

EyeCare AI is a framework-free academic eye-clinic prototype built with HTML, CSS, and vanilla JavaScript. It includes visual screening tools, voice/manual/camera input modes, local examination history, PDF reports, and experimental camera-assisted testing.

The site is also an installable Progressive Web App (PWA). PWA support is additive: the existing pages and examination logic remain the source of truth.

## Run locally

A service worker cannot run reliably from `file://`. Start a local static server from the repository root:

```powershell
py -m http.server 8000
```

Open `http://localhost:8000/`. For repository-subpath testing, serve the parent directory and open the project through a path ending in `/EyeCare-AI/`, or run the focused PWA browser test described below.

Camera and microphone features require permission and a secure context (`https://` or `localhost`).

## Install the PWA

- **Android / Chrome:** open the HTTPS GitHub Pages site. Use the browser's **Install app** action, or the Arabic **تثبيت التطبيق** button when Chrome exposes the installation prompt.
- **iPhone / Safari:** open the site in Safari, tap **Share**, choose **Add to Home Screen**, then tap **Add**. The footer also shows this guidance on supported iOS Safari browsers.

The install control is conditional. It is not shown when the browser does not provide an install prompt or when the app is already running in standalone mode.

## Offline boundaries

The service worker caches a small public application shell and only allowlisted public static pages/assets. Previously loaded allowlisted pages may reopen offline.

The following are deliberately not cached:

- examination history, patient/doctor dashboards, messages, and appointments;
- uploaded OCT/Fundus or other medical images;
- generated reports, authentication data, API responses, or requests carrying authorization headers;
- third-party MediaPipe modules, WASM, and model files.

Camera and Web Speech behavior depends on browser support and permissions. Chrome speech recognition may require an internet connection. Real-time camera modes need the external MediaPipe resources listed in `js/mediapipe-face.js` and `js/vision-realtime.js`; those resources are not cached by this PWA. Installing the app does not make every examination available offline.

## Real-Time Vision Test (experimental)

The camera-assisted mode is available from **Clinic Services → Vision Test → Try Real-Time Vision Test (Camera)**. It uses the existing Tumbling E levels and calibrated symbol-sizing calculations, while face and hand landmarks provide experimental distance guidance and pointing-gesture input.

After camera, screen, and 1-meter reference calibration, the user presses **أنا جاهز** once. The interface waits for a reliable 2-meter reading, shows a cancellable countdown, and starts automatically. Arrow keys and on-screen direction buttons remain available as fallback controls.

No camera frame is recorded, uploaded, or saved by the application. Distance is estimated from a user-confirmed one-meter reference and apparent face size; it is not clinically validated. Experimental results are intentionally not written to examination history.

## PWA files and cache updates

- `manifest.webmanifest` uses relative `start_url` and `scope`, so it resolves correctly at both `/` and `/EyeCare-AI/`.
- `js/pwa.js` resolves the service-worker root from its own URL and registers root `sw.js` with the repository subpath as its scope.
- `sw.js` uses an explicit public allowlist. Increase its `VERSION` whenever deployed static files change so obsolete EyeCare caches are removed after activation.
- `offline.html` is a navigation fallback only; it does not claim that medical features work offline.

## Tests

Static and logic tests need only Node.js:

```powershell
node tests/pwa.test.js
node tests/speech-recognition.test.js
node tests/letter-vision-test.test.js
node tests/vision-realtime.test.js
node tests/eye-tracking-engine.test.js
node tests/eye-tracking-ui.test.js
node tests/prototype-pages.test.js
```

`tests/pwa-browser.test.js` and `tests/pwa-regression.test.js` require a dedicated Chromium/Edge instance with remote debugging on port `9223`. The test browser must use a new profile inside the operating system's temporary directory, never the repository or Downloads folder. See `tests/PWA-VALIDATION.md` for the exact command and cleanup notes.

## GitHub Pages deployment

GitHub Pages is configured to deploy the `main` branch from the repository root at `https://zaid-alatrash.github.io/EyeCare-AI/`. Pushes to `main` use this existing branch deployment. `_config.yml` prevents generated/test directories from being included by Jekyll.

No GitHub Actions Pages workflow is included, so the repository keeps one deployment path. This workspace does not commit, push, or deploy automatically.
