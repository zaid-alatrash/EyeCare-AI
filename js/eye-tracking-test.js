(() => {
  "use strict";
  const root = document.querySelector("[data-camera-test]");
  if (!root) return;
  const engine = window.EyeCareCameraEngine;
  const video = root.querySelector("[data-camera-video]");
  const placeholder = root.querySelector("[data-camera-placeholder]");
  const status = root.querySelector("[data-camera-status]");
  const controls = {
    start: root.querySelector('[data-camera-action="start"]'), pause: root.querySelector('[data-camera-action="pause"]'), resume: root.querySelector('[data-camera-action="resume"]'), stop: root.querySelector('[data-camera-action="stop"]')
  };
  const diagnostics = Object.fromEntries([...root.querySelectorAll("[data-diagnostic]")].map((item) => [item.dataset.diagnostic, item]));
  const targetSequence = [
    { direction: "center", x: 50, y: 50 }, { direction: "left", x: 18, y: 50 }, { direction: "right", x: 82, y: 50 }, { direction: "up", x: 50, y: 18 }, { direction: "down", x: 50, y: 82 }
  ];
  const FACE_STABLE_MS = 900;
  const CALIBRATION_DWELL_MS = 1000;
  const TRACKING_DWELL_MS = 1400;
  const TARGET_SETTLE_MS = 300;
  const state = { mode: "tracking", stream: null, landmarker: null, delegate: null, loading: false, running: false, paused: false, raf: 0, generation: 0, lastVideoTime: -1, faceStableAt: null, noFaceSince: null, phase: "idle", targetIndex: 0, targetStartedAt: 0, observations: [], gazeWindow: [], calibrationSamples: {}, calibration: null, blinkDetector: new engine.BlinkDetector(), countdownEndsAt: 0, recordingEndsAt: 0, recordingStartedAt: 0, validMs: 0, lastFrameAt: null, pausedAt: null, result: null, saved: { tracking: null, blink: null } };

  function setStatus(message, error = false) { status.textContent = message; status.classList.toggle("is-error", error); }
  function setDiagnostic(name, text, level = "") {
    const item = diagnostics[name];
    if (!item) return;
    item.textContent = text;
    item.className = level ? `is-${level}` : "";
  }
  function setDiagnostics(values) { Object.entries(values).forEach(([name, value]) => setDiagnostic(name, value[0], value[1])); }
  function setControls(active) { controls.start.disabled = active || state.loading; controls.pause.disabled = !active; controls.stop.disabled = !active && !state.loading; controls.pause.hidden = state.paused; controls.resume.hidden = !state.paused; }
  function cameraError(error) {
    if (!navigator.mediaDevices?.getUserMedia) return "الكاميرا غير مدعومة في هذا المتصفح أو السياق.";
    if (["NotAllowedError", "SecurityError"].includes(error?.name)) return "تم رفض إذن الكاميرا. اسمح به من إعدادات الموقع ثم حاول مجددًا.";
    if (["NotFoundError", "OverconstrainedError"].includes(error?.name)) return "لم يتم العثور على كاميرا متاحة.";
    return "تعذر تشغيل الكاميرا أو تحميل نموذج MediaPipe. تحقق من الاتصال والإذن ثم حاول مجددًا.";
  }

  function resetModeUI() {
    root.querySelector("[data-tracking-results]").hidden = true;
    root.querySelector("[data-tracking-save-actions]").hidden = true;
    root.querySelector("[data-blink-results]").hidden = true;
    root.querySelector("[data-blink-save-actions]").hidden = true;
    root.querySelector("[data-blink-count]").textContent = "0";
    root.querySelector("[data-blink-time]").textContent = "—";
    root.querySelector("[data-tracking-message]").textContent = "ابدأ الكاميرا ثم انظر أمامك للمعايرة.";
  }

  function resetSession() {
    Object.assign(state, { faceStableAt: null, noFaceSince: null, phase: "waiting-face", targetIndex: 0, targetStartedAt: 0, observations: [], gazeWindow: [], calibrationSamples: {}, calibration: null, countdownEndsAt: 0, recordingEndsAt: 0, recordingStartedAt: 0, validMs: 0, lastFrameAt: null, result: null });
    state.blinkDetector.reset();
    resetModeUI();
    setDiagnostics({ camera: ["قيد التحميل", "warning"], face: ["بانتظار الوجه", "warning"], eyes: ["بانتظار المعالم", "warning"], calibration: ["معلّقة", "warning"], tracking: ["غير جاهز", "warning"] });
  }

  async function start() {
    if (state.loading || state.running) return;
    resetSession();
    state.loading = true; setControls(false); setStatus("جارٍ طلب إذن الكاميرا وتحميل نموذج MediaPipe…");
    const generation = ++state.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } });
      if (generation !== state.generation) { stream.getTracks().forEach((track) => track.stop()); return; }
      const detector = await window.EyeCareFaceLandmarker.create();
      if (generation !== state.generation) { detector.landmarker.close?.(); stream.getTracks().forEach((track) => track.stop()); return; }
      state.stream = stream; state.landmarker = detector.landmarker; state.delegate = detector.delegate;
      video.srcObject = stream; await video.play();
      await waitForVideoDimensions(video);
      state.loading = false; state.running = true; state.paused = false; placeholder.hidden = true; setControls(true);
      setDiagnostics({ camera: ["نشطة"], face: ["بانتظار الوجه", "warning"], eyes: ["بانتظار المعالم", "warning"], calibration: ["معلّقة", "warning"], tracking: ["جاهز", "warning"] });
      setStatus(`الكاميرا تعمل والمعالجة محلية باستخدام ${detector.delegate}. ابقَ بوجه واحد واضح أمام الكاميرا.`);
      processFrame();
    } catch (error) { console.warn("[EyeCare tracking] camera/model startup failed", error); cleanup(false); setDiagnostics({ camera: ["غير متاحة", "error"], tracking: ["غير جاهز", "error"] }); setStatus(cameraError(error), true); }
  }

  async function waitForVideoDimensions(target, timeoutMs = 2500) {
    if (target.videoWidth && target.videoHeight) return true;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanupListeners();
        reject(new Error("Video stream has no dimensions"));
      }, timeoutMs);
      const ready = () => {
        if (!target.videoWidth || !target.videoHeight) return;
        cleanupListeners();
        resolve();
      };
      const cleanupListeners = () => {
        window.clearTimeout(timeout);
        target.removeEventListener("loadedmetadata", ready);
        target.removeEventListener("resize", ready);
      };
      target.addEventListener("loadedmetadata", ready);
      target.addEventListener("resize", ready);
    });
    return true;
  }

  function beginCalibration(now) {
    state.phase = "calibration"; state.targetIndex = 0; state.targetStartedAt = now; state.calibrationSamples = {}; state.gazeWindow = []; moveTarget();
    root.querySelector("[data-tracking-message]").textContent = "المعايرة: انظر إلى كل نقطة حتى تنتقل تلقائيًا.";
    setDiagnostics({ calibration: ["قيد التنفيذ", "warning"], tracking: ["بانتظار المعايرة", "warning"] });
  }
  function moveTarget() {
    const item = targetSequence[state.targetIndex];
    const target = root.querySelector("[data-tracking-target]"); target.style.left = `${item.x}%`; target.style.top = `${item.y}%`;
  }
  function processTracking(landmarks, now) {
    if (state.phase === "waiting-face") {
      if (state.faceStableAt === null) state.faceStableAt = now;
      setDiagnostics({ face: ["تم اكتشاف الوجه"], eyes: ["المعالم قيد التحقق", "warning"] });
      const remaining = Math.max(0, Math.ceil((FACE_STABLE_MS - (now - state.faceStableAt)) / 1000));
      root.querySelector("[data-tracking-message]").textContent = remaining ? `ثبّت رأسك للمعايرة… ${remaining}` : "اكتملت المعايرة.";
      if (now - state.faceStableAt >= FACE_STABLE_MS) beginCalibration(now);
      return;
    }
    if (!['calibration', 'tracking'].includes(state.phase)) return;
    const gaze = engine.estimateGaze(landmarks);
    if (gaze?.reliable) {
      setDiagnostics({ face: ["تم اكتشاف الوجه"], eyes: ["المعالم صالحة"] });
      state.gazeWindow.push(gaze); if (state.gazeWindow.length > 5) state.gazeWindow.shift();
      const smooth = { reliable: true, x: state.gazeWindow.reduce((sum, item) => sum + item.x, 0) / state.gazeWindow.length, y: state.gazeWindow.reduce((sum, item) => sum + item.y, 0) / state.gazeWindow.length };
      if (state.phase === 'calibration') {
        if (now - state.targetStartedAt > TARGET_SETTLE_MS) (state.calibrationSamples[targetSequence[state.targetIndex].direction] ||= []).push(smooth);
      } else if (now - state.targetStartedAt > TARGET_SETTLE_MS) {
        const estimate = engine.classifyCalibratedGaze(smooth, state.calibration);
        state.observations.push({ valid: Boolean(estimate), target: targetSequence[state.targetIndex].direction, estimated: estimate?.direction || null });
      }
    } else {
      const eyeMessage = gaze?.reason === "head-pose" ? "حرّك الرأس أقل" : gaze?.reason === "missing-iris" ? "معالم القزحية غير متاحة" : "المعالم غير موثوقة";
      setDiagnostic("eyes", eyeMessage, "warning");
      if (state.phase === 'tracking') state.observations.push({ valid: false });
    }
    const dwell = state.phase === 'calibration' ? CALIBRATION_DWELL_MS : TRACKING_DWELL_MS;
    if (now - state.targetStartedAt >= dwell) {
      state.targetIndex += 1;
      if (state.targetIndex >= targetSequence.length && state.phase === 'calibration') finishCalibration(now);
      else if (state.targetIndex >= targetSequence.length) finishTracking();
      else { state.targetStartedAt = now; state.gazeWindow = []; moveTarget(); }
    }
  }
  function finishCalibration(now) {
    const entries = targetSequence.map(({ direction }) => [direction, state.calibrationSamples[direction] || []]);
    state.calibration = engine.buildCalibration(Object.fromEntries(entries));
    if (!state.calibration) return finishTrackingUnavailable("لم تُجمع عينات كافية من العينين أثناء المعايرة. تأكد من ظهور العينين ثم أعد المحاولة.");
    const horizontal = Math.abs(state.calibration.left.x - state.calibration.right.x);
    const vertical = Math.abs(state.calibration.up.y - state.calibration.down.y);
    state.phase = 'tracking'; state.targetIndex = 0; state.targetStartedAt = now; state.observations = []; state.gazeWindow = []; moveTarget();
    const weakAxis = horizontal < .015 || vertical < .018;
    root.querySelector("[data-tracking-message]").textContent = weakAxis
      ? "اكتملت المعايرة بإشارة اتجاهية محدودة. اتبع النقاط؛ ستحدد النتيجة مدى الاتساق الفعلي."
      : "اكتملت المعايرة. اتبع النقاط الآن لبدء القياس.";
    setDiagnostics({ calibration: [weakAxis ? "مكتملة بإشارة محدودة" : "ناجحة", weakAxis ? "warning" : ""], tracking: ["نشط"] });
  }
  function finishTrackingUnavailable(message) {
    state.result = { mode: "tracking", reliable: false, validObservations: 0, matchedObservations: 0, consistency: null, totalObservations: 0 };
    state.phase = "calibration-failed";
    root.querySelector("[data-tracking-results]").hidden = false;
    root.querySelector("[data-tracking-valid]").textContent = "0";
    root.querySelector("[data-tracking-matched]").textContent = "غير متاح";
    root.querySelector("[data-tracking-score]").textContent = "غير متاح";
    root.querySelector("[data-tracking-explanation]").textContent = message;
    root.querySelector("[data-tracking-message]").textContent = "تعذر إكمال المعايرة. أعد المحاولة مع تثبيت الرأس.";
    root.querySelector("[data-tracking-save-actions]").hidden = false;
    root.querySelector("[data-retry-calibration]").hidden = false;
    setDiagnostics({ calibration: ["فشلت", "error"], tracking: ["بيانات غير كافية", "error"] });
  }
  function finishTracking() {
    const result = engine.summarizeTracking(state.observations);
    state.result = { mode: "tracking", ...result, totalObservations: state.observations.length };
    state.phase = "complete";
    root.querySelector("[data-tracking-results]").hidden = false;
    root.querySelector("[data-tracking-valid]").textContent = String(result.validObservations);
    root.querySelector("[data-tracking-matched]").textContent = result.reliable ? String(result.matchedObservations) : "غير متاح";
    root.querySelector("[data-tracking-score]").textContent = result.reliable ? `${result.consistency}%` : "غير متاح";
    root.querySelector("[data-tracking-explanation]").textContent = engine.interpretTracking(state.result);
    root.querySelector("[data-tracking-message]").textContent = "اكتمل الاختبار.";
    root.querySelector("[data-tracking-save-actions]").hidden = false;
    setDiagnostic("tracking", result.reliable ? "اكتمل" : "بيانات غير كافية", result.reliable ? "" : "error");
    cleanup(false, true);
  }

  function processBlink(landmarks, now) {
    if (state.phase === "waiting-face") {
      if (state.faceStableAt === null) state.faceStableAt = now;
      if (now - state.faceStableAt >= 1000) { state.phase = "countdown"; state.countdownEndsAt = now + 3000; }
      return;
    }
    if (state.phase === "countdown") {
      root.querySelector("[data-blink-time]").textContent = `يبدأ بعد ${Math.max(1, Math.ceil((state.countdownEndsAt - now) / 1000))}`;
      if (now >= state.countdownEndsAt) {
        const duration = Number(root.querySelector('input[name="blink-duration"]:checked').value);
        state.phase = "recording"; state.recordingStartedAt = now; state.recordingEndsAt = now + duration * 1000; state.lastFrameAt = now;
      }
      return;
    }
    if (state.phase !== "recording") return;
    const delta = Math.min(150, Math.max(0, now - (state.lastFrameAt ?? now))); state.lastFrameAt = now; state.validMs += delta;
    const ear = engine.averageEyeAspectRatio(landmarks);
    const blink = state.blinkDetector.update(ear, now, true);
    root.querySelector("[data-blink-count]").textContent = String(blink.count);
    root.querySelector("[data-blink-time]").textContent = `${Math.max(0, Math.ceil((state.recordingEndsAt - now) / 1000))} ث`;
    if (now >= state.recordingEndsAt) finishBlink(false);
  }
  function finishBlink(endedEarly = false) {
    const total = state.blinkDetector.count; const validSeconds = Math.round(state.validMs / 1000); const selectedDuration = Number(root.querySelector('input[name="blink-duration"]:checked').value);
    const elapsedSeconds = state.recordingStartedAt ? Math.min(selectedDuration, Math.max(0, Math.round((performance.now() - state.recordingStartedAt) / 1000))) : 0;
    const rate = state.validMs >= 5000 ? Math.round(total * 60000 / state.validMs) : null;
    const trackingRatio = elapsedSeconds ? validSeconds / elapsedSeconds : 0;
    const quality = validSeconds < 5 ? "insufficient" : (!endedEarly && elapsedSeconds >= selectedDuration - 1 && trackingRatio >= .8 ? "complete" : "partial");
    const qualityLabel = quality === "complete" ? "قياس مكتمل" : quality === "partial" ? "قياس جزئي" : "بيانات غير كافية";
    state.result = { mode: "blink", total, validSeconds, elapsedSeconds, rate, quality, selectedDuration };
    state.phase = "complete";
    root.querySelector("[data-blink-results]").hidden = false;
    root.querySelector("[data-blink-total]").textContent = String(total);
    root.querySelector("[data-blink-quality]").textContent = qualityLabel;
    root.querySelector("[data-blink-elapsed]").textContent = `${selectedDuration} / ${elapsedSeconds} ثانية`;
    root.querySelector("[data-blink-valid]").textContent = `${validSeconds} ثانية`;
    root.querySelector("[data-blink-rate]").textContent = rate === null ? "غير متاح" : `${rate} / دقيقة`;
    root.querySelector("[data-blink-explanation]").textContent = engine.interpretBlink(state.result);
    root.querySelector("[data-blink-save-actions]").hidden = false;
    cleanup(false, true);
  }

  function processFrame() {
    if (!state.running || state.paused || !state.landmarker) return;
    const now = performance.now();
    if (video.readyState >= 2 && video.currentTime !== state.lastVideoTime) {
      state.lastVideoTime = video.currentTime;
      try {
        const result = state.landmarker.detectForVideo(video, now); const landmarks = result.faceLandmarks?.[0];
        if (landmarks) {
          state.noFaceSince = null;
          if (state.mode === "tracking") processTracking(landmarks, now); else processBlink(landmarks, now);
        } else {
          setDiagnostics({ face: ["لم يُكتشف", "error"], eyes: ["غير متاحة", "error"] });
          state.faceStableAt = null; state.blinkDetector.update(null, now, false);
          if (state.noFaceSince === null) state.noFaceSince = now;
          if (state.phase === "recording") state.lastFrameAt = now;
          if (now - state.noFaceSince > 1800) setStatus("الوجه غير ظاهر بوضوح. أعد وضع وجهك أمام الكاميرا؛ توقف القياس مؤقتًا.", true);
        }
      } catch (error) { console.warn("[EyeCare tracking] frame inference failed", error); setDiagnostic("eyes", "تعذر التحليل", "error"); setStatus("تعذر تحليل إطار الكاميرا. أوقف الاختبار وحاول مجددًا.", true); }
    }
    if (state.running) state.raf = requestAnimationFrame(processFrame);
  }

  function pause() { if (!state.running || state.paused) return; state.paused = true; state.pausedAt = performance.now(); cancelAnimationFrame(state.raf); video.pause(); setControls(true); setStatus("تم إيقاف المعالجة مؤقتًا."); }
  async function resume() { if (!state.running || !state.paused) return; const pausedFor = performance.now() - state.pausedAt; if (state.countdownEndsAt) state.countdownEndsAt += pausedFor; if (state.recordingEndsAt) state.recordingEndsAt += pausedFor; if (state.targetStartedAt) state.targetStartedAt += pausedFor; state.paused = false; await video.play(); setControls(true); setStatus("تمت متابعة المعالجة المحلية."); processFrame(); }

  function cleanup(showStopped = true, preserveResult = false) {
    state.generation += 1; state.running = false; state.paused = false; state.loading = false; cancelAnimationFrame(state.raf);
    state.stream?.getTracks().forEach((track) => track.stop());
    try { state.landmarker?.close?.(); } catch (error) { /* resource already closed */ }
    state.stream = null; state.landmarker = null; state.delegate = null; video.pause(); video.srcObject = null; placeholder.hidden = false; setControls(false);
    if (!preserveResult) state.phase = "idle";
    if (showStopped) setStatus("تم إيقاف الكاميرا وتحرير مواردها.");
  }

  function stop() {
    if (state.mode === "blink" && state.phase === "recording") finishBlink(true);
    else cleanup();
  }

  function retryCalibration() {
    if (!state.running || state.mode !== "tracking") return;
    Object.assign(state, { phase: "waiting-face", faceStableAt: null, targetIndex: 0, observations: [], gazeWindow: [], calibrationSamples: {}, calibration: null });
    root.querySelector("[data-tracking-results]").hidden = true;
    root.querySelector("[data-tracking-save-actions]").hidden = true;
    root.querySelector("[data-retry-calibration]").hidden = true;
    setDiagnostics({ calibration: ["معلّقة", "warning"], tracking: ["جاهز", "warning"] });
    setStatus("أعد تثبيت الرأس وانظر إلى الكاميرا لبدء المعايرة.");
  }

  function selectMode(mode) {
    if (mode === state.mode) return;
    cleanup(false); state.mode = mode; resetModeUI();
    root.querySelectorAll("[data-mode]").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.mode === mode)));
    root.querySelectorAll("[data-mode-panel]").forEach((panel) => { panel.hidden = panel.dataset.modePanel !== mode; });
    setStatus("اختر تشغيل وبدء للسماح باستخدام الكاميرا.");
  }

  async function save(mode) {
    if (!state.result || state.result.mode !== mode || state.saved[mode]) return;
    const label = mode === "tracking" ? "اختبار تتبع العين" : "جلسة اكتشاف الرمش";
    const name = await EyeCareExamTools.requestReportName(EyeCareExamTools.defaultReportName(label, new Date())); if (!name) return;
    const resultData = mode === "tracking" ? { experimental: true, reliable: state.result.reliable, validObservations: state.result.validObservations, matchedObservations: state.result.matchedObservations, consistency: state.result.consistency, totalObservations: state.result.totalObservations, interpretation: engine.interpretTracking(state.result) } : { experimental: true, totalBlinks: state.result.total, validObservationSeconds: state.result.validSeconds, elapsedSeconds: state.result.elapsedSeconds, estimatedBlinksPerMinute: state.result.rate, measurementQuality: state.result.quality, selectedDuration: state.result.selectedDuration, interpretation: engine.interpretBlink(state.result) };
    const summary = mode === "tracking" ? (state.result.reliable ? `اتساق تقديري ${state.result.consistency}% من ${state.result.validObservations} مشاهدة صالحة` : `تعذر القياس الدقيق؛ ${state.result.validObservations} مشاهدة صالحة`) : `${state.result.total} رمشات خلال ${state.result.validSeconds} ثانية رصد صالحة`;
    const saved = EyeCareHistory.addRecord({ type: mode === "tracking" ? "eye-tracking" : "blink-detection", title: name, date: new Date().toISOString(), summary, resultData });
    if (saved.success) { state.saved[mode] = saved.record.id; setStatus("حُفظت النتيجة الرقمية فقط دون أي صور أو فيديو."); root.querySelector(`[data-save-mode="${mode}"]`).disabled = true; } else setStatus(saved.error, true);
  }

  root.addEventListener("click", (event) => {
    const mode = event.target.closest("[data-mode]")?.dataset.mode; if (mode) selectMode(mode);
    const action = event.target.closest("[data-camera-action]")?.dataset.cameraAction;
    if (action === "start") start(); if (action === "pause") pause(); if (action === "resume") resume(); if (action === "stop") stop();
    if (event.target.closest("[data-retry-calibration]")) retryCalibration();
    const saveMode = event.target.closest("[data-save-mode]")?.dataset.saveMode; if (saveMode) save(saveMode);
  });
  window.addEventListener("pagehide", () => cleanup(false));
  setControls(false);
  if (new URLSearchParams(window.location.search).get("mode") === "blink") selectMode("blink");
})();
