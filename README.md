<<<<<<< HEAD
# EyeCare AI frontend

EyeCare AI is a framework-free academic eye-clinic prototype built with HTML, CSS, and vanilla JavaScript. Open `index.html` for the main site. Most features work directly from the file system without a build step.

## Real-Time Vision Test (experimental)

The camera-assisted mode is available from **Clinic Services → Vision Test → Try Real-Time Vision Test (Camera)**. It uses the existing Tumbling E levels and calibrated symbol-sizing calculations, while face and hand landmarks provide experimental distance guidance and pointing-gesture input.

After camera, screen, and 1-meter reference calibration, the user presses **أنا جاهز** once. The interface then waits for a reliable 2-meter reading for two continuous seconds, displays a cancellable 3–2–1 countdown, and starts automatically. Camera and Tumbling E panels remain side by side on laptop screens. Distance interruptions and the right-to-left eye transition recover automatically without requiring the user to return to the computer. Arrow keys and on-screen direction buttons remain available as fallback controls.

Run the project from localhost for reliable camera access. From the project directory, use any static file server you already have, for example:

```powershell
py -m http.server 8000
```

Then visit `http://localhost:8000/pages/vision-test.html` in a current desktop browser and allow camera access. A deployed version should use HTTPS.

The real-time mode loads MediaPipe Tasks Vision `1.1.0`, its WebAssembly runtime, Face Landmarker model, and Hand Landmarker model from the jsDelivr and Google-hosted MediaPipe endpoints when the camera mode starts. An internet connection is therefore required on first use unless these assets are bundled locally later. No camera frame is recorded, uploaded, or saved by the application.

Distance is not measured directly. The user first confirms a measured 1-meter reference position; the browser then estimates relative distance from changes in apparent face size. Head angle, camera optics, lighting, occlusion, and movement can reduce reliability. The test pauses gesture input when the estimate is unreliable or outside the 2-meter tolerance, unless the user explicitly selects manual-distance mode.

Experimental results are intentionally not written to examination history and are not clinically validated.
=======
# EyeCare-AI
AI-Powered Eye Care Clinic and Vision Testing Platform
>>>>>>> origin/main
