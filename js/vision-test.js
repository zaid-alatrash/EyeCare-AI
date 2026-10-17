(() => {
  "use strict";

  const engine = window.EyeCareVisionEngine;
  if (!engine) return;
  const speechApi = window.EyeCareSpeechRecognition;
  const VOICE_FEEDBACK_DELAY_MS = 1200;
  const DIRECTION_LABELS = Object.freeze({ up: "أعلى", down: "أسفل", left: "يسار", right: "يمين" });
  const {
    CARD_WIDTH_MM,
    CARD_HEIGHT_MM,
    NOMINAL_CARD_WIDTH_PX,
    TRIALS_PER_LEVEL,
    REQUIRED_CORRECT,
    ACUITY_LEVELS,
  } = engine;

  const app = document.querySelector("[data-vision-app]");
  if (!app) return;

  const state = {
    currentStep: "type-selection",
    calibrationScale: null,
    calibrationStatus: "pending",
    calibrationCardWidth: NOMINAL_CARD_WIDTH_PX,
    currentEye: "right",
    currentAcuityLevel: 0,
    trialCount: 0,
    correctAnswers: 0,
    rightEyeResult: null,
    leftEyeResult: null,
    completedAt: null,
    savedRecordId: null,
    currentOrientation: "right",
    previousOrientation: null,
    inputLocked: false,
    trials: [],
    answerMode: "manual",
  };

  const elements = {
    steps: [...app.querySelectorAll("[data-step]")],
    progressSteps: [...document.querySelectorAll("[data-progress-step]")],
    restartLink: document.querySelector("[data-restart]"),
    calibrationStage: app.querySelector(".calibration-stage"),
    calibrationCard: app.querySelector("[data-calibration-card]"),
    calibrationSize: app.querySelector("[data-calibration-size]"),
    reliabilityNote: app.querySelector("[data-reliability-note]"),
    eyeLabel: app.querySelector("[data-eye-label]"),
    coverInstruction: app.querySelector("[data-cover-instruction]"),
    levelLabel: app.querySelector("[data-level-label]"),
    trialLabel: app.querySelector("[data-trial-label]"),
    optotype: app.querySelector("[data-optotype]"),
    directionButtons: [...app.querySelectorAll(".direction-pad [data-direction]")],
    answerStatus: app.querySelector("[data-answer-status]"),
    transitionResult: app.querySelector("[data-transition-result]"),
    rightResult: app.querySelector("[data-right-result]"),
    leftResult: app.querySelector("[data-left-result]"),
    rightExplanation: app.querySelector("[data-right-explanation]"),
    leftExplanation: app.querySelector("[data-left-explanation]"),
    calibrationResult: app.querySelector("[data-calibration-result]"),
    saveHistoryButton: app.querySelector("[data-save-history]"),
    printReportButton: app.querySelector("[data-print-report]"),
    resultActionStatus: app.querySelector("[data-result-action-status]"),
    reviewButton: app.querySelector("[data-review-answers]"),
    answerInstruction: app.querySelector("[data-answer-instruction]"),
    voicePanel: app.querySelector("[data-voice-panel]"),
    voiceToggle: app.querySelector("[data-voice-toggle]"),
    voiceButtonLabel: app.querySelector("[data-voice-button-label]"),
    voiceStatus: app.querySelector("[data-voice-status]"),
    voiceLanguage: app.querySelector("[data-voice-language]"),
    voiceManual: app.querySelector("[data-voice-manual]"),
    voiceTranscriptRow: app.querySelector("[data-voice-transcript-row]"),
    voiceTranscript: app.querySelector("[data-voice-transcript]"),
    voiceDirectionRow: app.querySelector("[data-voice-direction-row]"),
    voiceDirection: app.querySelector("[data-voice-direction]"),
    voiceResultRow: app.querySelector("[data-voice-result-row]"),
    voiceResult: app.querySelector("[data-voice-result]"),
    modeSelector: document.querySelector("[data-vision-mode-selector]"),
    modeButtons: [...document.querySelectorAll("[data-vision-mode]")],
  };

  let answerSequence = 0;

  function clearVoiceFeedback() {
    elements.voiceTranscriptRow.hidden = true;
    elements.voiceDirectionRow.hidden = true;
    elements.voiceResultRow.hidden = true;
    elements.voiceTranscript.textContent = "";
    elements.voiceDirection.textContent = "";
    elements.voiceResult.textContent = "";
    elements.voiceResult.className = "";
  }

  function showVoiceFeedback({ transcript = "", direction = "", result = "", className = "" }) {
    elements.voiceTranscriptRow.hidden = !transcript;
    elements.voiceTranscript.textContent = transcript;
    elements.voiceDirectionRow.hidden = !direction;
    elements.voiceDirection.textContent = direction ? (DIRECTION_LABELS[direction] || direction) : "";
    elements.voiceResultRow.hidden = !result;
    elements.voiceResult.textContent = result;
    elements.voiceResult.className = className;
  }

  function updateVoiceState({ name, message, transcript = "", direction = "", active = false }) {
    if (!elements.voiceStatus) return;
    const listening = name === "listening";
    elements.voiceStatus.textContent = message;
    elements.voiceStatus.classList.toggle("is-error", ["error", "unsupported"].includes(name));
    elements.voiceToggle.classList.toggle("is-listening", active);
    elements.voiceToggle.setAttribute("aria-pressed", String(active));
    elements.voiceButtonLabel.textContent = active
      ? "إيقاف الاستماع"
      : ["error", "unrecognized"].includes(name) ? "إعادة المحاولة" : "ابدأ الاستماع";
    elements.voiceLanguage.disabled = listening;

    if (name === "listening") clearVoiceFeedback();
    if (name === "recorded") {
      showVoiceFeedback({ transcript, direction, result: "جارٍ التحقق من الإجابة" });
    }
    if (name === "unrecognized") {
      showVoiceFeedback({
        transcript,
        direction: "غير مفهوم",
        result: "لم يتم التعرف على الإجابة",
        className: "is-unrecognized",
      });
    }
    if (["error", "unsupported"].includes(name)) {
      showVoiceFeedback({ result: "تعذر إكمال التعرف الصوتي", className: "is-error" });
    }
  }

  function updateModeSelection(mode) {
    elements.modeButtons.forEach((button) => {
      const selected = button.dataset.visionMode === mode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function updateModeSwitcherVisibility(forceVisible = false) {
    const switchableStep = ["calibration", "preparation", "testing", "transition"].includes(state.currentStep);
    elements.modeSelector.hidden = !(forceVisible || switchableStep);
  }

  function showManualFallback() {
    elements.voiceManual.hidden = false;
  }

  const voiceController = speechApi?.createController({
    language: "ar-SA",
    onState: updateVoiceState,
    onDirection: (direction, transcript) => submitAnswer(direction, "voice", transcript),
    onOfferManual: showManualFallback,
  });

  function setAnswerMode(mode) {
    state.answerMode = mode === "voice" ? "voice" : "manual";
    updateModeSelection(state.answerMode);
    const voiceActive = state.answerMode === "voice";
    elements.voicePanel.hidden = !voiceActive || state.currentStep !== "testing";
    elements.answerInstruction.textContent = voiceActive
      ? "قل اتجاه فتحة الحرف، ويمكنك استخدام الأزرار يدويًا عند الحاجة."
      : "اختر اتجاه الفتحة، أو استخدم أسهم لوحة المفاتيح.";
    if (!voiceActive) {
      voiceController?.stop();
      elements.voiceManual.hidden = true;
      return;
    }
    clearVoiceFeedback();
    if (!voiceController?.supported) {
      updateVoiceState({ name: "unsupported", message: "المتصفح لا يدعم التعرف الصوتي" });
      elements.voiceToggle.disabled = true;
      showManualFallback();
    } else {
      elements.voiceToggle.disabled = false;
      updateVoiceState({ name: "idle", message: "اضغط لبدء الاستماع" });
    }
  }

  function selectMode(mode) {
    if (mode === "camera") {
      voiceController?.stop();
      updateModeSelection("camera");
      return;
    }

    const alreadySelected = elements.modeButtons.some((button) => (
      button.dataset.visionMode === mode && button.getAttribute("aria-pressed") === "true"
    ));
    if (alreadySelected) {
      if (state.currentStep === "intro") openCalibration();
      return;
    }

    window.dispatchEvent(new CustomEvent("eyecare:close-realtime"));
    setAnswerMode(mode);
    if (state.currentStep === "intro") openCalibration();
  }

  function stopVoiceForManualAnswer() {
    if (state.answerMode === "voice") {
      voiceController?.stop({ resetAuthorization: false, message: "تم تسجيل الإجابة يدويًا" });
      clearVoiceFeedback();
    }
  }

  const progressOrder = ["setup", "right", "left", "results"];

  function getProgressStep() {
    if (["type-selection", "intro", "calibration", "preparation"].includes(state.currentStep)) return "setup";
    if (state.currentStep === "results") return "results";
    if (state.currentStep === "transition" || state.currentEye === "left") return "left";
    return "right";
  }

  function updateProgress() {
    const activeStep = getProgressStep();
    const activeIndex = progressOrder.indexOf(activeStep);

    elements.progressSteps.forEach((item) => {
      const itemIndex = progressOrder.indexOf(item.dataset.progressStep);
      item.classList.toggle("is-active", itemIndex === activeIndex);
      item.classList.toggle("is-complete", itemIndex < activeIndex);
    });
  }

  function showStep(stepName, moveFocus = true) {
    state.currentStep = stepName;
    elements.steps.forEach((step) => {
      const isVisible = step.dataset.step === stepName;
      step.hidden = !isVisible;
      step.classList.toggle("is-visible", isVisible);
    });
    elements.voicePanel.hidden = state.answerMode !== "voice" || stepName !== "testing";
    updateModeSwitcherVisibility();

    elements.restartLink.hidden = ["type-selection", "intro"].includes(stepName);
    updateProgress();

    if (moveFocus) {
      const heading = app.querySelector(`[data-step="${stepName}"] h2`);
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: false });
      }
    }
  }

  function getMaximumCardWidth() {
    const stageWidth = elements.calibrationStage.clientWidth;
    if (stageWidth <= 48) return Math.min(520, NOMINAL_CARD_WIDTH_PX);
    return Math.max(180, Math.min(520, stageWidth - 48));
  }

  function updateCalibrationCard(width) {
    state.calibrationCardWidth = Math.max(180, Math.min(width, getMaximumCardWidth()));
    elements.calibrationCard.style.width = `${state.calibrationCardWidth}px`;
    elements.calibrationCard.style.aspectRatio = `${CARD_WIDTH_MM} / ${CARD_HEIGHT_MM}`;
    const percentage = Math.round((state.calibrationCardWidth / NOMINAL_CARD_WIDTH_PX) * 100);
    elements.calibrationSize.textContent = `${percentage}%`;
  }

  function resetCalibrationSize() {
    updateCalibrationCard(Math.min(NOMINAL_CARD_WIDTH_PX, getMaximumCardWidth()));
  }

  function openCalibration() {
    showStep("calibration");
    requestAnimationFrame(() => requestAnimationFrame(resetCalibrationSize));
  }

  function openPreparation(wasSkipped) {
    if (wasSkipped) {
      state.calibrationStatus = "skipped";
      state.calibrationScale = null;
      elements.reliabilityNote.className = "reliability-note is-skipped";
      elements.reliabilityNote.textContent = "تم تخطي المعايرة؛ ستُستخدم أحجام تقريبية وقد تقل موثوقية النتيجة.";
    } else {
      state.calibrationStatus = "completed";
      state.calibrationCardWidth = elements.calibrationCard.getBoundingClientRect().width;
      state.calibrationScale = state.calibrationCardWidth / CARD_WIDTH_MM;
      elements.reliabilityNote.className = "reliability-note";
      elements.reliabilityNote.textContent = "اكتملت المعايرة. أبقِ تكبير المتصفح وإعدادات الشاشة ثابتة.";
    }

    showStep("preparation");
  }

  function calculateOptotypeSize() {
    return engine.calculateOptotypeSize(state.currentAcuityLevel, state.calibrationScale);
  }

  function chooseOrientation() {
    const nextOrientation = engine.chooseOrientation(state.previousOrientation);
    state.previousOrientation = nextOrientation;
    state.currentOrientation = nextOrientation;
    elements.optotype.dataset.direction = nextOrientation;
  }

  function updateTestDisplay() {
    const isRightEye = state.currentEye === "right";
    elements.eyeLabel.textContent = isRightEye ? "العين اليمنى" : "العين اليسرى";
    elements.coverInstruction.textContent = isRightEye
      ? "أبقِ العين اليسرى مغطاة دون ضغط."
      : "أبقِ العين اليمنى مغطاة دون ضغط.";
    elements.levelLabel.textContent = `المستوى ${state.currentAcuityLevel + 1} من ${ACUITY_LEVELS.length}`;
    elements.trialLabel.textContent = `المحاولة ${state.trialCount + 1} من ${TRIALS_PER_LEVEL}`;

    const maximumSize = Math.min(190, Math.max(100, window.innerWidth * 0.38));
    const optotypeSize = Math.max(10, Math.min(calculateOptotypeSize(), maximumSize));
    elements.optotype.style.setProperty("--optotype-size", `${optotypeSize.toFixed(2)}px`);
    chooseOrientation();
  }

  function beginEye(eye) {
    state.currentEye = eye;
    state.currentAcuityLevel = 0;
    state.trialCount = 0;
    state.correctAnswers = 0;
    state.previousOrientation = null;
    state.inputLocked = false;
    elements.answerStatus.textContent = "";
    setDirectionButtonsDisabled(false);
    showStep("testing");
    updateTestDisplay();
    if (state.answerMode === "voice") {
      elements.voiceToggle.disabled = !voiceController?.supported;
      voiceController?.continueAfterQuestion();
    }
  }

  function setDirectionButtonsDisabled(disabled) {
    elements.directionButtons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  const { formatResult, interpretAcuity } = engine;

  function completeEye(result) {
    const defensibleResult = state.calibrationStatus === "completed" ? result : "unavailable";
    if (state.currentEye === "right") {
      voiceController?.stop({ resetAuthorization: false, message: "استعد لفحص العين اليسرى" });
      state.rightEyeResult = defensibleResult;
      elements.transitionResult.textContent = formatResult(defensibleResult);
      state.currentEye = "left";
      showStep("transition");
      return;
    }

    state.leftEyeResult = defensibleResult;
    voiceController?.stop();
    state.completedAt = new Date().toISOString();
    state.savedRecordId = null;
    renderResults();
    showStep("results");
  }

  function completeLevel() {
    const passed = state.correctAnswers >= REQUIRED_CORRECT;

    if (!passed) {
      const result = state.currentAcuityLevel === 0
        ? "below"
        : ACUITY_LEVELS[state.currentAcuityLevel - 1].label;
      completeEye(result);
      return;
    }

    if (state.currentAcuityLevel === ACUITY_LEVELS.length - 1) {
      completeEye(ACUITY_LEVELS[state.currentAcuityLevel].label);
      return;
    }

    state.currentAcuityLevel += 1;
    state.trialCount = 0;
    state.correctAnswers = 0;
    updateTestDisplay();
    releaseAnswerLock();
  }

  function releaseAnswerLock() {
    state.inputLocked = false;
    setDirectionButtonsDisabled(false);
    elements.answerStatus.textContent = "";
    if (state.answerMode === "voice") {
      elements.voiceToggle.disabled = !voiceController?.supported;
      voiceController?.continueAfterQuestion();
    }
  }

  function submitAnswer(direction, source = "manual", transcript = "") {
    if (state.currentStep !== "testing" || state.inputLocked) return;

    const submissionSequence = ++answerSequence;
    state.inputLocked = true;
    setDirectionButtonsDisabled(true);
    const isCorrect = direction === state.currentOrientation;
    state.trials.push({
      questionNumber: state.trials.length + 1,
      label: `${state.currentEye === "right" ? "العين اليمنى" : "العين اليسرى"} · المستوى ${state.currentAcuityLevel + 1} · المحاولة ${state.trialCount + 1}`,
      eye: state.currentEye,
      level: state.currentAcuityLevel + 1,
      userAnswer: direction,
      correctAnswer: state.currentOrientation,
      isCorrect,
      inputMethod: source,
      stimulus: { direction: state.currentOrientation },
    });
    state.trialCount += 1;
    if (isCorrect) state.correctAnswers += 1;
    elements.answerStatus.textContent = "تم تسجيل الإجابة";
    if (source === "voice") {
      elements.voiceToggle.disabled = true;
      showVoiceFeedback({
        transcript,
        direction,
        result: isCorrect ? "صحيحة" : "غير صحيحة",
        className: isCorrect ? "is-correct" : "is-incorrect",
      });
    }

    window.setTimeout(() => {
      if (submissionSequence !== answerSequence) return;
      if (state.trialCount >= TRIALS_PER_LEVEL) {
        completeLevel();
      } else {
        updateTestDisplay();
        releaseAnswerLock();
      }
    }, source === "voice" ? VOICE_FEEDBACK_DELAY_MS : 320);
  }

  function renderResults() {
    elements.rightResult.textContent = formatResult(state.rightEyeResult);
    elements.leftResult.textContent = formatResult(state.leftEyeResult);
    const calibrated = state.calibrationStatus === "completed";
    elements.rightExplanation.textContent = interpretAcuity(state.rightEyeResult, { calibrated, eyeLabel: "العين اليمنى" });
    elements.leftExplanation.textContent = interpretAcuity(state.leftEyeResult, { calibrated, eyeLabel: "العين اليسرى" });
    elements.calibrationResult.textContent = state.calibrationStatus === "completed"
      ? "مكتملة"
      : "تم تخطيها — لا يُعرض كسر سنلن";
    elements.saveHistoryButton.disabled = false;
    elements.saveHistoryButton.textContent = "حفظ في السجل";
    elements.resultActionStatus.textContent = "";
    elements.resultActionStatus.classList.remove("is-error");
  }

  function createResultRecord() {
    const rightEye = formatResult(state.rightEyeResult);
    const leftEye = formatResult(state.leftEyeResult);
    const calibration = state.calibrationStatus === "completed" ? "Completed" : "Skipped";
    const calibrated = state.calibrationStatus === "completed";
    const rightInterpretation = interpretAcuity(state.rightEyeResult, { calibrated, eyeLabel: "العين اليمنى" });
    const leftInterpretation = interpretAcuity(state.leftEyeResult, { calibrated, eyeLabel: "العين اليسرى" });
    const inputMethods = new Set(state.trials.map((trial) => trial.inputMethod).filter(Boolean));
    const inputMethod = inputMethods.size === 1 ? [...inputMethods][0] : "mixed";

    return {
      type: "vision",
      title: "اختبار حدة النظر",
      date: state.completedAt || new Date().toISOString(),
      summary: `العين اليمنى: ${rightEye} · العين اليسرى: ${leftEye}`,
      resultData: {
        rightEye,
        leftEye,
        rightEyeCode: state.rightEyeResult,
        leftEyeCode: state.leftEyeResult,
        calibration,
        inputMethod,
        scoringRule: `النجاح في المستوى يتطلب ${REQUIRED_CORRECT} من ${TRIALS_PER_LEVEL} إجابات صحيحة، والنتيجة هي أصغر مستوى تم اجتيازه لكل عين.`,
        rightInterpretation,
        leftInterpretation,
        interpretation: `${rightInterpretation} ${leftInterpretation}`,
        explanation: calibrated
          ? "يلخص التقرير فحصًا تعليميًا لحدة النظر أُجري في المتصفح على مسافة مترين وبعد معايرة العرض."
          : "لم تُحسب نتيجة سنلن لأن معايرة العرض لم تكتمل.",
        reviewData: {
          kind: "manual-vision",
          summary: `الصحيح: ${state.trials.filter((trial) => trial.isCorrect).length} · غير الصحيح: ${state.trials.filter((trial) => !trial.isCorrect).length}`,
          trials: state.trials.map((trial) => ({
            ...trial,
            userAnswer: directionLabel(trial.userAnswer),
            correctAnswer: directionLabel(trial.correctAnswer),
          })),
        },
      },
    };
  }

  function directionLabel(direction) {
    return ({ up: "أعلى", down: "أسفل", left: "يسار", right: "يمين" })[direction] || direction;
  }

  async function saveResultToHistory() {
    if (state.savedRecordId) return;
    if (!window.EyeCareHistory) {
      elements.resultActionStatus.textContent = "تعذر الوصول إلى السجل، ويمكنك طباعة النتيجة.";
      elements.resultActionStatus.classList.add("is-error");
      return;
    }

    const reportName = await window.EyeCareExamTools?.requestReportName(
      window.EyeCareExamTools.defaultReportName("فحص حدة النظر", state.completedAt)
    );
    if (!reportName) return;
    const record = createResultRecord();
    record.title = reportName;
    const saveResult = window.EyeCareHistory.addRecord(record);
    if (!saveResult.success) {
      elements.resultActionStatus.textContent = saveResult.error || "تعذر حفظ النتيجة.";
      elements.resultActionStatus.classList.add("is-error");
      return;
    }

    state.savedRecordId = saveResult.record.id;
    elements.saveHistoryButton.disabled = true;
    elements.saveHistoryButton.textContent = "تم الحفظ";
    elements.resultActionStatus.textContent = "حُفظت النتيجة محليًا في هذا المتصفح.";
    elements.resultActionStatus.classList.remove("is-error");
  }

  async function printCurrentResult() {
    if (!window.EyeCareReport) {
      elements.resultActionStatus.textContent = "تعذر تجهيز التقرير للطباعة.";
      elements.resultActionStatus.classList.add("is-error");
      return;
    }
    elements.resultActionStatus.textContent = "جارٍ تجهيز ملف PDF…";
    const result = await window.EyeCareReport.downloadPdf(createResultRecord());
    elements.resultActionStatus.textContent = result.success ? `تم تنزيل ${result.filename}.` : result.error;
    elements.resultActionStatus.classList.toggle("is-error", !result.success);
  }

  function reviewAnswers() {
    window.EyeCareExamTools?.openReview(createResultRecord().resultData.reviewData, "مراجعة اختبار النظر");
  }

  function restartTest() {
    answerSequence += 1;
    Object.assign(state, {
      currentStep: "type-selection",
      calibrationScale: null,
      calibrationStatus: "pending",
      calibrationCardWidth: NOMINAL_CARD_WIDTH_PX,
      currentEye: "right",
      currentAcuityLevel: 0,
      trialCount: 0,
      correctAnswers: 0,
      rightEyeResult: null,
      leftEyeResult: null,
      completedAt: null,
      savedRecordId: null,
      currentOrientation: "right",
      previousOrientation: null,
      inputLocked: false,
      trials: [],
      answerMode: "manual",
    });

    voiceController?.stop();
    elements.voiceManual.hidden = true;
    clearVoiceFeedback();
    elements.answerStatus.textContent = "";
    elements.resultActionStatus.textContent = "";
    elements.optotype.dataset.direction = "right";
    setDirectionButtonsDisabled(false);
    updateModeSelection("manual");
    showStep("type-selection");
  }

  app.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "choose-e-test") showStep("intro");
    if (action === "start") { setAnswerMode("manual"); openCalibration(); }
    if (action === "start-voice") { setAnswerMode("voice"); openCalibration(); }
    if (action === "skip-calibration") openPreparation(true);
    if (action === "confirm-calibration") openPreparation(false);
    if (action === "ready") beginEye("right");
    if (action === "start-left") beginEye("left");
    if (action === "restart") restartTest();
  });

  app.querySelector("[data-calibration-decrease]").addEventListener("click", () => {
    updateCalibrationCard(state.calibrationCardWidth - 8);
  });

  app.querySelector("[data-calibration-increase]").addEventListener("click", () => {
    updateCalibrationCard(state.calibrationCardWidth + 8);
  });

  app.querySelector("[data-calibration-reset]").addEventListener("click", resetCalibrationSize);
  elements.restartLink.addEventListener("click", restartTest);
  elements.reviewButton.addEventListener("click", reviewAnswers);
  elements.saveHistoryButton.addEventListener("click", saveResultToHistory);
  elements.printReportButton.addEventListener("click", printCurrentResult);

  elements.directionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      stopVoiceForManualAnswer();
      submitAnswer(button.dataset.direction, "manual");
    });
  });

  document.addEventListener("keydown", (event) => {
    const keyDirections = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const direction = keyDirections[event.key];
    if (!direction || state.currentStep !== "testing") return;
    event.preventDefault();
    stopVoiceForManualAnswer();
    submitAnswer(direction, "manual");
  });

  elements.voiceToggle.addEventListener("click", () => {
    if (voiceController?.isActive()) voiceController.stop();
    else voiceController?.start(true);
  });
  elements.voiceLanguage.addEventListener("change", () => voiceController?.setLanguage(elements.voiceLanguage.value));
  elements.voiceManual.addEventListener("click", () => setAnswerMode("manual"));
  elements.modeButtons.forEach((button) => {
    button.addEventListener("click", () => selectMode(button.dataset.visionMode));
  });

  window.addEventListener("eyecare:realtime-opened", () => {
    updateModeSelection("camera");
    updateModeSwitcherVisibility(true);
  });
  window.addEventListener("eyecare:realtime-closed", () => {
    updateModeSelection(state.answerMode);
    updateModeSwitcherVisibility();
  });

  window.addEventListener("resize", () => {
    if (state.currentStep === "calibration") {
      updateCalibrationCard(Math.min(state.calibrationCardWidth, getMaximumCardWidth()));
    }
  });
  window.addEventListener("pagehide", () => voiceController?.stop());

  updateModeSelection("manual");
  updateModeSwitcherVisibility();
  updateProgress();
})();
