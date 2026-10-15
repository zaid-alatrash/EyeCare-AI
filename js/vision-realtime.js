(() => {
  "use strict";

  const MEDIAPIPE_VERSION = "1.1.0";
  const MEDIAPIPE_MODULE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`;
  const MEDIAPIPE_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
  const FACE_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  const HAND_MODEL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const REFERENCE_DISTANCE_METERS = 1;
  const TARGET_DISTANCE_METERS = 2;
  const DISTANCE_TOLERANCE_METERS = 0.3;
  const FRAME_INTERVAL_MS = 90;
  const GESTURE_HOLD_MS = 650;
  const ANSWER_COOLDOWN_MS = 1200;
  const STABLE_DISTANCE_MS = 2000;
  const EYE_SWITCH_PREP_MS = 5000;

  function distance2d(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function getFaceMeasurement(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 100) return null;
    let minX = 1;
    let maxX = 0;
    let minY = 1;
    let maxY = 0;

    landmarks.forEach((point) => {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    if (width < 0.075 || width > 0.82 || height < 0.09) return null;

    const centered = Math.max(0, 1 - (Math.abs(centerX - 0.5) + Math.abs(centerY - 0.48)) * 1.8);
    const inFrame = minX > 0.015 && maxX < 0.985 && minY > 0.015 && maxY < 0.985 ? 1 : 0.45;
    const aspect = height / width;
    const aspectQuality = Math.max(0, 1 - Math.abs(aspect - 1.28) / 0.9);
    const confidence = Math.max(0, Math.min(1, centered * 0.45 + inFrame * 0.35 + aspectQuality * 0.2));
    return { width, height, centerX, centerY, minX, maxX, minY, maxY, confidence };
  }

  function estimateDistance(referenceFaceWidth, currentFaceWidth, referenceDistance = REFERENCE_DISTANCE_METERS) {
    if (![referenceFaceWidth, currentFaceWidth, referenceDistance].every((value) => Number.isFinite(value) && value > 0)) return null;
    return referenceDistance * (referenceFaceWidth / currentFaceWidth);
  }

  function classifyPointingGesture(landmarks, mirrored = true) {
    if (!Array.isArray(landmarks) || landmarks.length < 21) return null;
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const indexLength = distance2d(indexMcp, indexTip);
    const palmScale = Math.max(distance2d(wrist, landmarks[9]), 0.001);
    if (indexLength < palmScale * 0.85) return null;

    const otherFingers = [[9, 12], [13, 16], [17, 20]];
    const extendedOthers = otherFingers.filter(([mcp, tip]) => distance2d(landmarks[mcp], landmarks[tip]) > palmScale * 0.78).length;
    if (extendedOthers >= 2) return null;

    let dx = indexTip.x - indexPip.x;
    const dy = indexTip.y - indexPip.y;
    if (mirrored) dx *= -1;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude < 0.045) return null;
    if (Math.abs(dx) > Math.abs(dy) * 1.25) return dx > 0 ? "right" : "left";
    if (Math.abs(dy) > Math.abs(dx) * 1.25) return dy > 0 ? "down" : "up";
    return null;
  }

  class TemporalGestureFilter {
    constructor(holdMs = GESTURE_HOLD_MS) {
      this.holdMs = holdMs;
      this.reset();
    }

    reset() {
      this.direction = null;
      this.startedAt = 0;
    }

    update(direction, now) {
      if (!direction) {
        this.reset();
        return null;
      }
      if (direction !== this.direction) {
        this.direction = direction;
        this.startedAt = now;
        return null;
      }
      return now - this.startedAt >= this.holdMs ? direction : null;
    }
  }

  class StableConditionTimer {
    constructor(durationMs = STABLE_DISTANCE_MS) {
      this.durationMs = durationMs;
      this.reset();
    }

    reset() {
      this.startedAt = null;
    }

    update(valid, now) {
      if (!valid) {
        this.reset();
        return { ready: false, elapsed: 0, progress: 0 };
      }
      if (this.startedAt === null) this.startedAt = now;
      const elapsed = Math.max(0, now - this.startedAt);
      return {
        ready: elapsed >= this.durationMs,
        elapsed,
        progress: Math.min(1, elapsed / this.durationMs),
      };
    }
  }

  class CancellableCountdown {
    constructor(onTick, onComplete, schedule = window.setInterval.bind(window), unschedule = window.clearInterval.bind(window)) {
      this.onTick = onTick;
      this.onComplete = onComplete;
      this.schedule = schedule;
      this.unschedule = unschedule;
      this.timerId = null;
      this.remaining = 0;
    }

    start(seconds = 3) {
      this.cancel();
      this.remaining = seconds;
      this.onTick(this.remaining);
      this.timerId = this.schedule(() => {
        this.remaining -= 1;
        if (this.remaining <= 0) {
          this.cancel();
          this.onComplete();
          return;
        }
        this.onTick(this.remaining);
      }, 1000);
    }

    cancel() {
      if (this.timerId === null) return false;
      this.unschedule(this.timerId);
      this.timerId = null;
      this.remaining = 0;
      return true;
    }

    get active() {
      return this.timerId !== null;
    }
  }

  function isAnswerAcceptanceAllowed({ automationMode, answerLocked, needsNeutral, cooldownUntil, now, distanceAllowed, sizeValid }) {
    return automationMode === "testing"
      && !answerLocked
      && !needsNeutral
      && now >= cooldownUntil
      && distanceAllowed
      && sizeValid;
  }

  window.EyeCareRealtimeVision = Object.freeze({
    getFaceMeasurement,
    estimateDistance,
    classifyPointingGesture,
    TemporalGestureFilter,
    StableConditionTimer,
    CancellableCountdown,
    isAnswerAcceptanceAllowed,
    modelVersion: MEDIAPIPE_VERSION,
  });

  const app = document.querySelector("[data-realtime-app]");
  const engine = window.EyeCareVisionEngine;
  if (!app || !engine) return;

  const state = {
    stream: null,
    faceLandmarker: null,
    handLandmarker: null,
    detectorDelegate: null,
    animationFrame: 0,
    running: false,
    paused: false,
    loading: false,
    lastProcessedAt: 0,
    lastVideoTime: -1,
    calibrationScale: null,
    displayCalibration: "pending",
    cardWidth: engine.NOMINAL_CARD_WIDTH_PX,
    faceWidths: [],
    referenceFaceWidth: null,
    smoothedDistance: null,
    distanceConfidence: 0,
    distanceValid: false,
    manualDistance: false,
    stage: "screen-calibration",
    phase: "preparation",
    automationMode: "idle",
    countdownPurpose: null,
    transitionReadyAt: 0,
    sizeValid: true,
    eye: "right",
    rightResult: null,
    leftResult: null,
    session: null,
    currentTrial: null,
    answerLocked: false,
    answerCooldownUntil: 0,
    needsNeutralGesture: false,
    startGeneration: 0,
  };

  const gestureFilter = new TemporalGestureFilter();
  const distanceHold = new StableConditionTimer();
  const manualViews = [...document.querySelectorAll("[data-manual-vision]")];
  const elements = {
    setup: app.querySelector('[data-rt-section="setup"]'),
    camera: app.querySelector('[data-rt-section="camera"]'),
    alert: app.querySelector("[data-rt-alert]"),
    card: app.querySelector("[data-rt-calibration-card]"),
    cardSize: app.querySelector("[data-rt-card-size]"),
    video: app.querySelector("[data-rt-video]"),
    overlay: app.querySelector("[data-rt-overlay]"),
    loading: app.querySelector("[data-rt-loading]"),
    pause: app.querySelector('[data-rt-action="pause"]'),
    resume: app.querySelector('[data-rt-action="resume"]'),
    distance: app.querySelector("[data-rt-distance]"),
    distanceMessage: app.querySelector("[data-rt-distance-message]"),
    distanceConfidence: app.querySelector("[data-rt-distance-confidence]"),
    gesture: app.querySelector("[data-rt-gesture]"),
    gestureMessage: app.querySelector("[data-rt-gesture-message]"),
    gestureIcons: [...app.querySelectorAll("[data-rt-gesture-icon]")],
    systemStatus: app.querySelector("[data-rt-system-status]"),
    systemDetail: app.querySelector("[data-rt-system-detail]"),
    phaseSteps: [...app.querySelectorAll("[data-rt-phase-step]")],
    stages: [...app.querySelectorAll("[data-rt-stage]")],
    automation: app.querySelector("[data-rt-automation]"),
    automationValue: app.querySelector("[data-rt-automation-value]"),
    automationMessage: app.querySelector("[data-rt-automation-message]"),
    holdProgress: app.querySelector("[data-rt-hold-progress]"),
    captureDistance: app.querySelector('[data-rt-action="capture-distance"]'),
    positionInstruction: app.querySelector("[data-rt-position-instruction]"),
    eyeLabel: app.querySelector("[data-rt-eye-label]"),
    coverInstruction: app.querySelector("[data-rt-cover-instruction]"),
    level: app.querySelector("[data-rt-level]"),
    trial: app.querySelector("[data-rt-trial]"),
    optotype: app.querySelector("[data-rt-optotype]"),
    answerStatus: app.querySelector("[data-rt-answer-status]"),
    sizeWarning: app.querySelector("[data-rt-size-warning]"),
    manualDirectionButtons: [...app.querySelectorAll("[data-rt-manual-direction]")],
    testFallback: app.querySelector("[data-rt-action=\"manual-distance-test\"]"),
    transitionResult: app.querySelector("[data-rt-transition-result]"),
    rightResult: app.querySelector("[data-rt-right-result]"),
    leftResult: app.querySelector("[data-rt-left-result]"),
    rightExplanation: app.querySelector("[data-rt-right-explanation]"),
    leftExplanation: app.querySelector("[data-rt-left-explanation]"),
  };

  function showAlert(title, message, isError = false) {
    elements.alert.innerHTML = "";
    const strong = document.createElement("strong");
    const span = document.createElement("span");
    strong.textContent = title;
    span.textContent = message;
    elements.alert.append(strong, span);
    elements.alert.classList.toggle("is-error", isError);
  }

  function showStage(stage) {
    state.stage = stage;
    app.dataset.rtCurrentStage = stage;
    elements.stages.forEach((section) => {
      section.hidden = section.dataset.rtStage !== stage;
    });
  }

  function setPhase(phase) {
    state.phase = phase;
    app.dataset.rtPhase = phase;
    const order = ["preparation", "examination", "results"];
    const activeIndex = order.indexOf(phase);
    elements.phaseSteps.forEach((step) => {
      const index = order.indexOf(step.dataset.rtPhaseStep);
      step.classList.toggle("is-active", index === activeIndex);
      step.classList.toggle("is-complete", index < activeIndex);
    });
  }

  function showAutomation(value, message, progress = 0) {
    elements.automation.hidden = false;
    elements.automationValue.textContent = value;
    elements.automationMessage.textContent = message;
    elements.holdProgress.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
  }

  function hideAutomation() {
    elements.automation.hidden = true;
    elements.holdProgress.style.width = "0%";
  }

  function finishCountdown() {
    const purpose = state.countdownPurpose;
    state.countdownPurpose = null;
    hideAutomation();
    distanceHold.reset();
    if (purpose === "start") beginEye("right");
    if (purpose === "resume") {
      state.automationMode = "testing";
      state.answerLocked = false;
      elements.answerStatus.textContent = "ثبّت إشارة السبابة قليلاً، ثم أنزل يدك بعد تسجيل الإجابة.";
    }
    if (purpose === "left") beginEye("left");
  }

  const countdown = new CancellableCountdown(
    (value) => showAutomation(String(value), "استعد… سيبدأ الفحص تلقائياً"),
    finishCountdown,
  );

  function startAutomationCountdown(purpose) {
    state.countdownPurpose = purpose;
    state.automationMode = `countdown-${purpose}`;
    gestureFilter.reset();
    state.needsNeutralGesture = true;
    countdown.start(3);
  }

  function cancelAutomationCountdown(returnMode, message) {
    countdown.cancel();
    state.countdownPurpose = null;
    state.automationMode = returnMode;
    distanceHold.reset();
    showAutomation("—", message, 0);
  }

  function getMaximumCardWidth() {
    const stage = app.querySelector(".realtime-card-stage");
    return Math.max(180, Math.min(520, stage.clientWidth > 48 ? stage.clientWidth - 44 : engine.NOMINAL_CARD_WIDTH_PX));
  }

  function updateCard(width) {
    state.cardWidth = Math.max(180, Math.min(width, getMaximumCardWidth()));
    elements.card.style.width = `${state.cardWidth}px`;
    elements.card.style.aspectRatio = `${engine.CARD_WIDTH_MM} / ${engine.CARD_HEIGHT_MM}`;
    elements.cardSize.textContent = `${Math.round((state.cardWidth / engine.NOMINAL_CARD_WIDTH_PX) * 100)}%`;
  }

  function setSystemStatus(status, detail) {
    elements.systemStatus.textContent = status;
    elements.systemDetail.textContent = detail;
  }

  async function createLandmarkers() {
    const tasks = await import(MEDIAPIPE_MODULE);
    const vision = await tasks.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
    const createPair = async (delegate) => {
      let faceLandmarker = null;
      try {
        faceLandmarker = await tasks.FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate },
          runningMode: "VIDEO",
          numFaces: 1,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
        const handLandmarker = await tasks.HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        });
        return { faceLandmarker, handLandmarker, delegate };
      } catch (error) {
        faceLandmarker?.close?.();
        throw error;
      }
    };

    try {
      return await createPair("GPU");
    } catch (gpuError) {
      return createPair("CPU");
    }
  }

  function cameraErrorMessage(error) {
    if (!navigator.mediaDevices?.getUserMedia) return ["الكاميرا غير مدعومة", "استخدم متصفحاً حديثاً وافتح الصفحة عبر localhost أو HTTPS."];
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return ["تم رفض إذن الكاميرا", "اسمح باستخدام الكاميرا من إعدادات الموقع ثم حاول مجدداً."];
    if (error?.name === "NotFoundError" || error?.name === "OverconstrainedError") return ["لا توجد كاميرا متاحة", "وصّل الكاميرا أو فعّلها ثم حاول مجدداً."];
    if (error?.name === "NotReadableError" || error?.name === "AbortError") return ["تعذر استخدام الكاميرا", "قد يستخدم تطبيق آخر الكاميرا. أغلقه ثم حاول مجدداً."];
    return ["تعذر تشغيل الكاميرا", "تحقق من إذن الكاميرا واتصال الإنترنت ثم حاول مجدداً."];
  }

  async function startCamera() {
    if (state.loading || state.running) return;
    state.loading = true;
    const generation = ++state.startGeneration;
    state.displayCalibration = "pending";
    state.calibrationScale = null;
    elements.setup.hidden = true;
    elements.camera.hidden = false;
    elements.loading.hidden = false;
    setPhase("preparation");
    showStage("screen-calibration");
    requestAnimationFrame(() => updateCard(Math.min(state.cardWidth, getMaximumCardWidth())));
    setSystemStatus("جارٍ التحميل", "يتم تجهيز الكاميرا ونماذج الاكتشاف المحلية.");
    showAlert("مطلوب إذن الكاميرا", "اختر السماح عندما يطلب المتصفح استخدام الكاميرا. الفيديو يبقى على هذا الجهاز.");

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("Camera API unavailable", "NotSupportedError");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (generation !== state.startGeneration) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      state.stream = stream;
      const detectors = await createLandmarkers();
      if (generation !== state.startGeneration) {
        detectors.faceLandmarker.close?.();
        detectors.handLandmarker.close?.();
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      state.faceLandmarker = detectors.faceLandmarker;
      state.handLandmarker = detectors.handLandmarker;
      state.detectorDelegate = detectors.delegate;
      elements.video.srcObject = stream;
      await elements.video.play();
      state.running = true;
      state.paused = false;
      state.loading = false;
      elements.loading.hidden = true;
      elements.pause.disabled = false;
      setSystemStatus("الكاميرا تعمل", `MediaPipe ${MEDIAPIPE_VERSION} · معالجة محلية ${detectors.delegate}`);
      showAlert("الكاميرا تعمل", "يتم تحليل النقاط محلياً، ولا تُسجل الصور أو تُرفع أو تُحفظ.");
      processLoop();
    } catch (error) {
      stopCamera(false);
      const [title, message] = cameraErrorMessage(error);
      showAlert(title, message, true);
      setSystemStatus("غير متاح", message);
      elements.loading.hidden = true;
      state.loading = false;
      elements.setup.hidden = false;
      elements.camera.hidden = true;
    }
  }

  function clearOverlay() {
    elements.overlay.getContext("2d").clearRect(0, 0, elements.overlay.width, elements.overlay.height);
  }

  function drawLandmarks(faceMeasurement, handLandmarks) {
    const canvas = elements.overlay;
    const width = elements.video.videoWidth || 1280;
    const height = elements.video.videoHeight || 720;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, width, height);
    context.lineWidth = Math.max(2, width / 500);

    if (faceMeasurement) {
      context.strokeStyle = "#63ddd5";
      context.strokeRect(faceMeasurement.minX * width, faceMeasurement.minY * height, faceMeasurement.width * width, faceMeasurement.height * height);
    }

    if (handLandmarks) {
      context.strokeStyle = "#8fd4ff";
      context.beginPath();
      [0, 5, 6, 7, 8].forEach((index, position, sequence) => {
        const point = handLandmarks[index];
        if (position === 0) context.moveTo(point.x * width, point.y * height);
        else context.lineTo(point.x * width, point.y * height);
      });
      context.stroke();
    }
  }

  function measurementStability(values) {
    if (values.length < 6) return 0;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const coefficient = Math.sqrt(variance) / mean;
    return Math.max(0, Math.min(1, 1 - coefficient / 0.06));
  }

  function updateFaceStatus(faceMeasurement) {
    if (!faceMeasurement) {
      state.faceWidths = [];
      state.smoothedDistance = null;
      state.distanceConfidence = 0;
      state.distanceValid = false;
      elements.distance.textContent = "لم يتم اكتشاف الوجه";
      elements.distanceMessage.textContent = "اجعل وجهك كاملاً داخل الصورة وفي إضاءة جيدة.";
      elements.distanceConfidence.style.width = "0%";
      updateDistanceAutomation(performance.now());
      return;
    }

    state.faceWidths.push(faceMeasurement.width);
    if (state.faceWidths.length > 12) state.faceWidths.shift();
    const stable = measurementStability(state.faceWidths);
    state.distanceConfidence = faceMeasurement.confidence * 0.55 + stable * 0.45;
    elements.distanceConfidence.style.width = `${Math.round(state.distanceConfidence * 100)}%`;

    if (!state.referenceFaceWidth) {
      elements.distance.textContent = `تم اكتشاف الوجه · ${Math.round(state.distanceConfidence * 100)}%`;
      elements.distanceMessage.textContent = state.distanceConfidence >= 0.68
        ? "اثبت ثم سجّل مرجع المتر الواحد."
        : "تعذر تقدير المسافة بشكل موثوق — انظر مباشرة إلى الكاميرا واثبت.";
      elements.captureDistance.disabled = state.distanceConfidence < 0.68 || state.faceWidths.length < 8;
      return;
    }

    const averageWidth = state.faceWidths.reduce((sum, value) => sum + value, 0) / state.faceWidths.length;
    const estimate = estimateDistance(state.referenceFaceWidth, averageWidth);
    state.smoothedDistance = state.smoothedDistance === null ? estimate : state.smoothedDistance * 0.72 + estimate * 0.28;
    const reliable = state.distanceConfidence >= 0.52 && state.faceWidths.length >= 6;
    state.distanceValid = reliable && Math.abs(state.smoothedDistance - TARGET_DISTANCE_METERS) <= DISTANCE_TOLERANCE_METERS;
    elements.distance.textContent = reliable ? `≈ ${state.smoothedDistance.toFixed(2)} m` : "القراءة غير موثوقة";

    if (!reliable) elements.distanceMessage.textContent = "تعذر تقدير المسافة بشكل موثوق — انظر مباشرة إلى الكاميرا واثبت.";
    else if (state.smoothedDistance < TARGET_DISTANCE_METERS - DISTANCE_TOLERANCE_METERS) elements.distanceMessage.textContent = "ابتعد قليلاً عن الشاشة.";
    else if (state.smoothedDistance > TARGET_DISTANCE_METERS + DISTANCE_TOLERANCE_METERS) elements.distanceMessage.textContent = "اقترب قليلاً من الشاشة.";
    else elements.distanceMessage.textContent = "المسافة مناسبة تقريباً.";
    updateDistanceAutomation(performance.now());
  }

  function updateDistanceAutomation(now) {
    const allowed = state.manualDistance || state.distanceValid;
    const mode = state.automationMode;

    if (mode === "waiting-start") {
      const hold = distanceHold.update(allowed, now);
      showAutomation(
        allowed ? "2 m" : "—",
        allowed ? "اثبت في مكانك لمدة ثانيتين" : "تحرك حتى تصبح المسافة مناسبة",
        hold.progress,
      );
      if (hold.ready) startAutomationCountdown("start");
      return;
    }

    if (mode.startsWith("countdown-") && !allowed) {
      const purpose = state.countdownPurpose;
      const returnMode = purpose === "start" ? "waiting-start" : purpose === "left" ? "eye-transition" : "paused-distance";
      cancelAutomationCountdown(returnMode, "توقّف العد لأن المسافة لم تعد مناسبة");
      return;
    }

    if (mode === "testing" && !allowed) {
      state.automationMode = "paused-distance";
      distanceHold.reset();
      elements.answerStatus.classList.add("is-paused");
      elements.answerStatus.textContent = "توقفت الإجابات مؤقتاً حتى تثبت المسافة.";
      elements.testFallback.hidden = false;
      showAutomation("!", "عد إلى مسافة مترين وسيُستأنف الفحص تلقائياً");
      return;
    }

    if (mode === "paused-distance") {
      const hold = distanceHold.update(allowed, now);
      showAutomation(
        allowed ? "2 m" : "!",
        allowed ? "اثبت لاستئناف الفحص" : "عد إلى مسافة مترين",
        hold.progress,
      );
      elements.testFallback.hidden = allowed;
      if (hold.ready) startAutomationCountdown("resume");
      return;
    }

    if (mode === "eye-transition") {
      if (!allowed) {
        showAutomation("—", "بدّل العين المغطاة وعد إلى مسافة مترين");
        return;
      }
      const remaining = Math.max(0, state.transitionReadyAt - now);
      if (remaining > 0) {
        showAutomation(String(Math.ceil(remaining / 1000)), "غطِّ العين اليمنى واستعد لفحص العين اليسرى");
      } else {
        startAutomationCountdown("left");
      }
      return;
    }

    if (mode === "testing") {
      hideAutomation();
      elements.answerStatus.classList.remove("is-paused");
      elements.testFallback.hidden = true;
    }
  }

  function setGestureDisplay(direction, message) {
    const labels = { up: "أعلى ↑", down: "أسفل ↓", left: "يسار ←", right: "يمين →" };
    elements.gesture.textContent = direction ? labels[direction] : "لا توجد إشارة واضحة";
    elements.gestureMessage.textContent = message;
    elements.gestureIcons.forEach((icon) => icon.classList.toggle("is-active", icon.dataset.rtGestureIcon === direction));
  }

  function updateGesture(handResult, now) {
    const hands = handResult?.landmarks || [];
    if (hands.length !== 1) {
      gestureFilter.update(null, now);
      if (hands.length > 1) setGestureDisplay(null, "تظهر أكثر من يد. استخدم يداً واحدة فقط.");
      else setGestureDisplay(null, "اليد غير ظاهرة. أظهر يداً واحدة داخل الصورة.");
      if (!hands.length) state.needsNeutralGesture = false;
      return { direction: null, landmarks: hands[0] || null };
    }

    const direction = classifyPointingGesture(hands[0], true);
    if (!direction) {
      gestureFilter.update(null, now);
      setGestureDisplay(null, "أشر بسبابة واحدة بوضوح وتجنب الاتجاه المائل.");
      state.needsNeutralGesture = false;
      return { direction: null, landmarks: hands[0] };
    }

    setGestureDisplay(direction, state.needsNeutralGesture ? "أنزل يدك قبل الإجابة التالية." : "ثبّت هذا الاتجاه قليلاً.");
    const stableDirection = gestureFilter.update(direction, now);
    if (stableDirection && canAcceptGesture(now)) submitAnswer(stableDirection, now, "gesture");
    return { direction, landmarks: hands[0] };
  }

  function canAcceptGesture(now) {
    return isAnswerAcceptanceAllowed({
      automationMode: state.automationMode,
      answerLocked: state.answerLocked,
      needsNeutral: state.needsNeutralGesture,
      cooldownUntil: state.answerCooldownUntil,
      now,
      distanceAllowed: state.manualDistance || state.distanceValid,
      sizeValid: state.sizeValid,
    });
  }

  function processLoop(now = performance.now()) {
    if (!state.running || state.paused) return;
    if (now - state.lastProcessedAt >= FRAME_INTERVAL_MS && elements.video.readyState >= 2 && elements.video.currentTime !== state.lastVideoTime) {
      state.lastProcessedAt = now;
      state.lastVideoTime = elements.video.currentTime;
      try {
        const timestamp = Math.round(now);
        const faceResult = state.faceLandmarker.detectForVideo(elements.video, timestamp);
        const handResult = state.handLandmarker.detectForVideo(elements.video, timestamp);
        const faceLandmarks = faceResult.faceLandmarks?.[0] || null;
        const faceMeasurement = getFaceMeasurement(faceLandmarks);
        updateFaceStatus(faceMeasurement);
        const gesture = updateGesture(handResult, now);
        drawLandmarks(faceMeasurement, gesture.landmarks);
      } catch (error) {
        setSystemStatus("توقف الاكتشاف", "تعذرت معالجة إطار. تابع أو أعد تشغيل الكاميرا.");
        pauseCamera();
      }
    }
    state.animationFrame = requestAnimationFrame(processLoop);
  }

  function captureDistanceReference() {
    if (state.faceWidths.length < 8 || state.distanceConfidence < 0.68) return;
    const sorted = [...state.faceWidths].sort((a, b) => a - b);
    state.referenceFaceWidth = sorted[Math.floor(sorted.length / 2)];
    state.faceWidths = [];
    state.smoothedDistance = null;
    state.distanceValid = false;
    elements.captureDistance.disabled = true;
    showStage("position");
    showAlert("تم تسجيل المرجع", "اضغط «أنا جاهز» وأنت قريب، ثم ابتعد إلى مترين. سيبدأ الفحص تلقائياً.");
  }

  function finishDisplayCalibration(skipped) {
    state.displayCalibration = skipped ? "skipped" : "completed";
    state.calibrationScale = skipped ? null : elements.card.getBoundingClientRect().width / engine.CARD_WIDTH_MM;
    showStage("distance-calibration");
    showAlert(
      skipped ? "تم تخطي معايرة الشاشة" : "تمت معايرة الشاشة",
      skipped
        ? "سيُستخدم حجم احتياطي، لذلك تكون دقة القياس أقل موثوقية."
        : "لا تغيّر تكبير المتصفح أو إعدادات الشاشة أثناء الاختبار.",
      skipped,
    );
  }

  function useManualDistance() {
    state.manualDistance = true;
    elements.distance.textContent = "مسافة يدوية: 2 متر";
    elements.distanceMessage.textContent = "تم تجاوز التحقق التلقائي. استخدم مسافة مترين مقاسة قبل البدء.";
    elements.positionInstruction.textContent = "قِس مترين من الشاشة، ثم اضغط «أنا جاهز». سيعمل العد التنازلي تلقائياً ولكن المسافة لن تكون مراقبة.";
    showAlert("وضع المسافة اليدوية", "لن يتحقق النظام من المسافة. ستبقى إشارات اليد فعالة.", true);
    updateDistanceAutomation(performance.now());
  }

  function enterWaitingForDistance() {
    setPhase("examination");
    showStage("waiting");
    state.automationMode = "waiting-start";
    state.answerLocked = true;
    state.needsNeutralGesture = true;
    distanceHold.reset();
    gestureFilter.reset();
    showAlert("ابدأ بالابتعاد", "غطِّ العين اليسرى، وابتعد إلى مترين. لا حاجة للمس الجهاز مرة أخرى.");
    updateDistanceAutomation(performance.now());
    requestAnimationFrame(() => elements.camera.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function beginEye(eye) {
    state.eye = eye;
    state.session = engine.createTestSession();
    state.answerLocked = false;
    state.needsNeutralGesture = false;
    state.automationMode = "testing";
    gestureFilter.reset();
    showStage("testing");
    setPhase("examination");
    elements.eyeLabel.textContent = eye === "right" ? "العين اليمنى" : "العين اليسرى";
    elements.coverInstruction.textContent = eye === "right"
      ? "غطِّ العين اليسرى دون الضغط عليها."
      : "غطِّ العين اليمنى دون الضغط عليها.";
    nextTrial();
    updateDistanceAutomation(performance.now());
  }

  function renderCurrentTrialSize() {
    if (!state.currentTrial) return;
    const rawSize = engine.calculateOptotypeSize(state.currentTrial.levelIndex, state.calibrationScale);
    const area = app.querySelector(".realtime-optotype-area");
    const availableWidth = Math.max(0, area.clientWidth - 48);
    const availableHeight = Math.max(0, area.clientHeight - 48);
    const available = Math.min(availableWidth, availableHeight);
    state.sizeValid = rawSize <= available;
    elements.sizeWarning.hidden = state.sizeValid;
    elements.optotype.style.setProperty("--optotype-size", `${Math.max(10, Math.min(rawSize, available || rawSize)).toFixed(2)}px`);
    elements.manualDirectionButtons.forEach((button) => { button.disabled = !state.sizeValid; });
  }

  function nextTrial() {
    state.currentTrial = state.session.nextTrial();
    elements.level.textContent = `المستوى ${state.currentTrial.levelIndex + 1} من ${state.currentTrial.totalLevels}`;
    elements.trial.textContent = `المحاولة ${state.currentTrial.trialNumber} من ${state.currentTrial.trialsPerLevel}`;
    elements.optotype.dataset.direction = state.currentTrial.orientation;
    renderCurrentTrialSize();
    state.answerLocked = false;
    if ((state.manualDistance || state.distanceValid) && state.sizeValid) elements.answerStatus.textContent = "ثبّت إشارة السبابة قليلاً، ثم أنزل يدك بعد تسجيل الإجابة.";
  }

  function submitAnswer(direction, now, source = "gesture") {
    if (!canAcceptGesture(now)) return;
    state.answerLocked = true;
    state.needsNeutralGesture = source === "gesture";
    state.answerCooldownUntil = now + ANSWER_COOLDOWN_MS;
    gestureFilter.reset();
    const labels = { up: "أعلى", down: "أسفل", left: "يسار", right: "يمين" };
    elements.answerStatus.textContent = `تم تسجيل: ${labels[direction]} ✓${source === "gesture" ? " — أنزل يدك" : ""}`;
    const outcome = state.session.submit(direction);
    window.setTimeout(() => {
      if (outcome.status === "complete") completeEye(outcome.result);
      else nextTrial();
    }, 450);
  }

  function completeEye(result) {
    const conditionsAdequate = state.displayCalibration === "completed"
      && (state.manualDistance || state.distanceValid)
      && state.sizeValid;
    const defensibleResult = conditionsAdequate ? result : "unavailable";
    if (state.eye === "right") {
      state.rightResult = defensibleResult;
      elements.transitionResult.textContent = engine.formatResult(defensibleResult);
      showStage("transition");
      state.automationMode = "eye-transition";
      state.transitionReadyAt = performance.now() + EYE_SWITCH_PREP_MS;
      state.answerLocked = true;
      state.needsNeutralGesture = true;
      gestureFilter.reset();
      distanceHold.reset();
      showAutomation("5", "بدّل العين المغطاة واستعد لفحص العين اليسرى");
      return;
    }
    state.leftResult = defensibleResult;
    elements.rightResult.textContent = engine.formatResult(state.rightResult);
    elements.leftResult.textContent = engine.formatResult(state.leftResult);
    const context = state.manualDistance
      ? " استُخدمت مسافة قاسها المستخدم ولم تتحقق منها الكاميرا."
      : " تم التحقق من المسافة آليًا أثناء الاختبار.";
    const rightAdequate = state.rightResult !== "unavailable";
    const leftAdequate = state.leftResult !== "unavailable";
    elements.rightExplanation.textContent = `${engine.interpretAcuity(state.rightResult, { calibrated: rightAdequate, eyeLabel: "العين اليمنى" })}${rightAdequate ? context : ""}`;
    elements.leftExplanation.textContent = `${engine.interpretAcuity(state.leftResult, { calibrated: leftAdequate, eyeLabel: "العين اليسرى" })}${leftAdequate ? context : ""}`;
    state.automationMode = "results";
    setPhase("results");
    countdown.cancel();
    hideAutomation();
    showStage("results");
    showAlert("اكتمل الاختبار", "تبقى النتيجة في هذه الصفحة فقط ولا تُضاف إلى سجل الفحوصات.");
    stopCamera(false);
  }

  function pauseCamera() {
    if (!state.running || state.paused) return;
    state.paused = true;
    cancelAnimationFrame(state.animationFrame);
    elements.video.pause();
    elements.pause.hidden = true;
    elements.resume.hidden = false;
    if (state.automationMode.startsWith("countdown-")) {
      cancelAutomationCountdown(state.stage === "waiting" ? "waiting-start" : "paused-distance", "تم إيقاف الفحص مؤقتاً");
    }
    setSystemStatus("متوقف مؤقتاً", "الكاميرا مفتوحة، لكن الصور والإشارات لا تتم معالجتها.");
  }

  async function resumeCamera() {
    if (!state.running || !state.paused) return;
    state.paused = false;
    elements.pause.hidden = false;
    elements.resume.hidden = true;
    await elements.video.play();
    setSystemStatus("الكاميرا تعمل", `MediaPipe ${MEDIAPIPE_VERSION} · معالجة ${state.detectorDelegate || "محلية"}`);
    if (state.stage === "testing") {
      state.automationMode = "paused-distance";
      distanceHold.reset();
    }
    processLoop();
  }

  function stopCamera(returnToSetup = true) {
    state.startGeneration += 1;
    state.running = false;
    state.paused = false;
    countdown.cancel();
    cancelAnimationFrame(state.animationFrame);
    state.stream?.getTracks().forEach((track) => track.stop());
    try { state.faceLandmarker?.close?.(); } catch (error) { /* Already released. */ }
    try { state.handLandmarker?.close?.(); } catch (error) { /* Already released. */ }
    state.stream = null;
    state.faceLandmarker = null;
    state.handLandmarker = null;
    state.detectorDelegate = null;
    elements.video.pause();
    elements.video.srcObject = null;
    clearOverlay();
    elements.pause.hidden = false;
    elements.pause.disabled = true;
    elements.resume.hidden = true;
    if (returnToSetup) resetRealtime(false);
  }

  function resetRealtime(stopActive = true) {
    if (stopActive && (state.running || state.loading)) stopCamera(false);
    Object.assign(state, {
      loading: false,
      referenceFaceWidth: null,
      smoothedDistance: null,
      distanceConfidence: 0,
      distanceValid: false,
      manualDistance: false,
      faceWidths: [],
      stage: "screen-calibration",
      phase: "preparation",
      automationMode: "idle",
      countdownPurpose: null,
      transitionReadyAt: 0,
      sizeValid: true,
      eye: "right",
      rightResult: null,
      leftResult: null,
      session: null,
      currentTrial: null,
      answerLocked: false,
      needsNeutralGesture: false,
    });
    elements.setup.hidden = false;
    elements.camera.hidden = true;
    elements.loading.hidden = false;
    elements.captureDistance.disabled = true;
    elements.distance.textContent = "غير معايرة";
    elements.distanceMessage.textContent = "اجلس على مسافة متر واحد تقريباً من الكاميرا.";
    elements.distanceConfidence.style.width = "0%";
    setGestureDisplay(null, "أظهر يداً واحدة بوضوح داخل الصورة.");
    countdown.cancel();
    distanceHold.reset();
    hideAutomation();
    setPhase("preparation");
    showStage("screen-calibration");
    showAlert("خصوصية محلية", "تُعالج صور الكاميرا داخل المتصفح ولا يتم تسجيلها أو رفعها أو حفظها.");
  }

  function openRealtime() {
    manualViews.forEach((element) => { element.hidden = true; });
    app.hidden = false;
    requestAnimationFrame(() => updateCard(Math.min(engine.NOMINAL_CARD_WIDTH_PX, getMaximumCardWidth())));
    app.querySelector("h2")?.focus({ preventScroll: false });
  }

  function closeRealtime() {
    stopCamera(false);
    resetRealtime(false);
    app.hidden = true;
    manualViews.forEach((element) => { element.hidden = false; });
    document.querySelector("[data-open-realtime]")?.focus();
  }

  document.querySelector("[data-open-realtime]")?.addEventListener("click", openRealtime);
  app.addEventListener("click", (event) => {
    const cardAction = event.target.closest("[data-rt-card]")?.dataset.rtCard;
    if (cardAction === "decrease") updateCard(state.cardWidth - 8);
    if (cardAction === "increase") updateCard(state.cardWidth + 8);
    if (cardAction === "reset") updateCard(Math.min(engine.NOMINAL_CARD_WIDTH_PX, getMaximumCardWidth()));

    const action = event.target.closest("[data-rt-action]")?.dataset.rtAction;
    if (!action) return;
    if (action === "close") closeRealtime();
    if (action === "start-camera") startCamera();
    if (action === "confirm-display") finishDisplayCalibration(false);
    if (action === "skip-display") finishDisplayCalibration(true);
    if (action === "pause") pauseCamera();
    if (action === "resume") resumeCamera();
    if (action === "stop") stopCamera();
    if (action === "capture-distance") captureDistanceReference();
    if (action === "manual-distance") useManualDistance();
    if (action === "manual-distance-test") useManualDistance();
    if (action === "ready") enterWaitingForDistance();
    if (action === "restart") resetRealtime();
  });

  elements.manualDirectionButtons.forEach((button) => {
    button.addEventListener("click", () => submitAnswer(button.dataset.rtManualDirection, performance.now(), "manual"));
  });

  document.addEventListener("keydown", (event) => {
    const directions = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const direction = directions[event.key];
    if (!direction || app.hidden || state.stage !== "testing") return;
    event.preventDefault();
    submitAnswer(direction, performance.now(), "manual");
  });

  window.addEventListener("resize", () => {
    if (!app.hidden && !elements.setup.hidden) updateCard(Math.min(state.cardWidth, getMaximumCardWidth()));
    if (!app.hidden && state.stage === "testing") renderCurrentTrialSize();
  });
  window.addEventListener("pagehide", () => stopCamera(false));
  if (new URLSearchParams(window.location.search).get("mode") === "realtime") openRealtime();
})();
