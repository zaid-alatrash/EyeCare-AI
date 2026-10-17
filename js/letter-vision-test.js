(() => {
  "use strict";

  const engine = window.EyeCareLetterTest;
  const speechApi = window.EyeCareSpeechRecognition;
  const root = document.querySelector("[data-letter-test]");
  if (!engine || !root) return;

  const FEEDBACK_DELAY_MS = 1200;
  let session = engine.createSession();
  let step = "intro";
  let answerMode = "manual";
  let inputLocked = false;
  let completedAt = null;
  let savedRecordId = null;
  let answerSequence = 0;

  const elements = {
    steps: [...root.querySelectorAll("[data-letter-step]")],
    progress: [...document.querySelectorAll("[data-letter-progress]")],
    restartLink: document.querySelector("[data-letter-restart]"),
    startButtons: [...root.querySelectorAll("[data-letter-start]")],
    modeButtons: [...root.querySelectorAll("[data-letter-mode]")],
    eye: root.querySelector("[data-letter-eye]"),
    cover: root.querySelector("[data-letter-cover]"),
    level: root.querySelector("[data-letter-level]"),
    trial: root.querySelector("[data-letter-trial]"),
    optotype: root.querySelector("[data-letter-optotype]"),
    manualForm: root.querySelector("[data-letter-manual-form]"),
    input: root.querySelector("[data-letter-input]"),
    inputError: root.querySelector("[data-letter-input-error]"),
    voicePanel: root.querySelector("[data-letter-voice]"),
    voiceToggle: root.querySelector("[data-letter-voice-toggle]"),
    voiceLabel: root.querySelector("[data-letter-voice-label]"),
    voiceStatus: root.querySelector("[data-letter-voice-status]"),
    manualFallback: root.querySelector("[data-letter-manual-fallback]"),
    transcriptRow: root.querySelector("[data-letter-transcript-row]"),
    transcript: root.querySelector("[data-letter-transcript]"),
    interpretedRow: root.querySelector("[data-letter-interpreted-row]"),
    interpreted: root.querySelector("[data-letter-interpreted]"),
    resultRow: root.querySelector("[data-letter-result-row]"),
    result: root.querySelector("[data-letter-result]"),
    answerStatus: root.querySelector("[data-letter-answer-status]"),
    transitionResult: root.querySelector("[data-letter-transition-result]"),
    rightScore: root.querySelector("[data-letter-right-score]"),
    rightAccuracy: root.querySelector("[data-letter-right-accuracy]"),
    rightHighest: root.querySelector("[data-letter-right-highest]"),
    rightLevels: root.querySelector("[data-letter-right-levels]"),
    rightResult: root.querySelector("[data-letter-right-result]"),
    leftScore: root.querySelector("[data-letter-left-score]"),
    leftAccuracy: root.querySelector("[data-letter-left-accuracy]"),
    leftHighest: root.querySelector("[data-letter-left-highest]"),
    leftLevels: root.querySelector("[data-letter-left-levels]"),
    leftResult: root.querySelector("[data-letter-left-result]"),
    save: root.querySelector("[data-letter-save]"),
    pdf: root.querySelector("[data-letter-pdf]"),
    review: root.querySelector("[data-letter-review]"),
    resultStatus: root.querySelector("[data-letter-result-status]"),
  };

  function clearVoiceFeedback() {
    elements.transcriptRow.hidden = true;
    elements.interpretedRow.hidden = true;
    elements.resultRow.hidden = true;
    elements.transcript.textContent = "";
    elements.interpreted.textContent = "";
    elements.result.textContent = "";
    elements.result.className = "";
  }

  function showVoiceFeedback({ transcript = "", answer = "", result = "", className = "" }) {
    elements.transcriptRow.hidden = !transcript;
    elements.transcript.textContent = transcript;
    elements.interpretedRow.hidden = !answer;
    elements.interpreted.textContent = answer;
    elements.resultRow.hidden = !result;
    elements.result.textContent = result;
    elements.result.className = className;
  }

  function updateVoiceState({ name, message, transcript = "", answer = "", active = false }) {
    elements.voiceStatus.textContent = message;
    elements.voiceStatus.classList.toggle("is-error", ["error", "unsupported"].includes(name));
    elements.voiceToggle.classList.toggle("is-listening", active);
    elements.voiceToggle.setAttribute("aria-pressed", String(active));
    elements.voiceLabel.textContent = active ? "إيقاف الاستماع" : ["error", "unrecognized"].includes(name) ? "إعادة المحاولة" : "ابدأ الاستماع";
    if (name === "listening") clearVoiceFeedback();
    if (name === "recorded") showVoiceFeedback({ transcript, answer, result: "جارٍ التحقق من الإجابة" });
    if (name === "unrecognized") showVoiceFeedback({ transcript, result: "لم يتم التعرف على الإجابة", className: "is-unrecognized" });
    if (["error", "unsupported"].includes(name)) showVoiceFeedback({ result: "تعذر إكمال التعرف الصوتي", className: "is-error" });
  }

  function offerManualFallback() {
    elements.manualFallback.hidden = false;
  }

  const voiceController = speechApi?.createController({
    language: "en-US",
    interpretTranscript: engine.mapTranscriptToLetter,
    contextualPhrases: engine.SPEECH_PHRASES,
    phraseBoost: 4,
    minimumConfidence: 0.45,
    onState: updateVoiceState,
    onAnswer: (letter, transcript) => submitAnswer(letter, "voice", transcript),
    onOfferManual: offerManualFallback,
  });

  function progressName() {
    if (step === "results") return "results";
    if (step === "testing" || step === "transition") return session.snapshot().eye;
    return "preparation";
  }

  function updateProgress() {
    const order = ["preparation", "right", "left", "results"];
    const activeIndex = order.indexOf(progressName());
    elements.progress.forEach((item) => {
      const index = order.indexOf(item.dataset.letterProgress);
      item.classList.toggle("is-active", index === activeIndex);
      item.classList.toggle("is-complete", index < activeIndex);
    });
  }

  function showStep(nextStep, moveFocus = true) {
    step = nextStep;
    elements.steps.forEach((item) => { item.hidden = item.dataset.letterStep !== nextStep; });
    elements.restartLink.hidden = nextStep === "intro";
    updateProgress();
    if (moveFocus) {
      const heading = root.querySelector(`[data-letter-step="${nextStep}"] h2`);
      heading?.setAttribute("tabindex", "-1");
      heading?.focus?.({ preventScroll: false });
    }
  }

  function setMode(mode) {
    answerMode = mode === "voice" ? "voice" : "manual";
    const voiceActive = answerMode === "voice";
    elements.manualForm.hidden = voiceActive;
    elements.voicePanel.hidden = !voiceActive;
    elements.modeButtons.forEach((button) => {
      const selected = button.dataset.letterMode === answerMode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });

    if (!voiceActive) {
      voiceController?.stop();
      elements.manualFallback.hidden = true;
      clearVoiceFeedback();
      if (step === "testing") elements.input.focus();
      return;
    }

    clearVoiceFeedback();
    if (!voiceController?.supported) {
      elements.voiceToggle.disabled = true;
      updateVoiceState({ name: "unsupported", message: "المتصفح لا يدعم التعرف الصوتي" });
      offerManualFallback();
    } else {
      elements.voiceToggle.disabled = false;
      updateVoiceState({ name: "idle", message: "اضغط لبدء الاستماع" });
    }
  }

  function renderTrial() {
    const trial = session.nextTrial();
    if (!trial) return;
    const eyeRight = trial.eye === "right";
    elements.eye.textContent = eyeRight ? "العين اليمنى" : "العين اليسرى";
    elements.cover.textContent = eyeRight ? "أبقِ العين اليسرى مغطاة دون ضغط." : "أبقِ العين اليمنى مغطاة دون ضغط.";
    elements.level.textContent = `المستوى ${trial.levelIndex + 1} من ${engine.DIFFICULTY_LEVELS.length} · ${trial.level}`;
    elements.trial.textContent = `المحاولة ${trial.trialInLevel + 1} من ${engine.TRIALS_PER_LEVEL}`;
    elements.optotype.textContent = trial.letter;
    elements.optotype.style.setProperty("--letter-size", `${trial.fontSize}px`);
    elements.input.value = "";
    elements.input.disabled = false;
    elements.inputError.textContent = "";
    elements.answerStatus.textContent = "";
    inputLocked = false;
    if (answerMode === "manual") elements.input.focus();
    if (answerMode === "voice" && voiceController?.isActive()) voiceController.continueAfterQuestion();
  }

  function beginEye() {
    showStep("testing");
    renderTrial();
  }

  function submitAnswer(answer, inputMethod, transcript = "") {
    if (step !== "testing" || inputLocked) return;
    const token = ++answerSequence;
    const outcome = session.submit(answer, inputMethod, transcript);
    if (!outcome) return;
    inputLocked = true;
    elements.input.disabled = true;
    elements.voiceToggle.disabled = true;
    elements.answerStatus.textContent = outcome.trial.isCorrect ? "إجابة صحيحة" : "إجابة غير صحيحة";
    if (inputMethod === "voice") {
      showVoiceFeedback({
        transcript,
        answer,
        result: outcome.trial.isCorrect ? "صحيحة" : "غير صحيحة",
        className: outcome.trial.isCorrect ? "is-correct" : "is-incorrect",
      });
    }

    window.setTimeout(() => {
      if (token !== answerSequence) return;
      if (outcome.status === "eye-complete") {
        voiceController?.stop({ resetAuthorization: false, message: "استعد لفحص العين اليسرى" });
        elements.transitionResult.textContent = `${outcome.summary.correct} إجابات صحيحة من ${outcome.summary.total} (${outcome.summary.accuracy}%). ${outcome.summary.approximateResult}.`;
        showStep("transition");
        return;
      }
      if (outcome.status === "complete") {
        voiceController?.stop();
        completedAt = new Date().toISOString();
        savedRecordId = null;
        renderResults();
        showStep("results");
        return;
      }
      elements.voiceToggle.disabled = !voiceController?.supported;
      renderTrial();
    }, FEEDBACK_DELAY_MS);
  }

  function submitManualAnswer() {
    const answer = engine.normalizeManualLetter(elements.input.value);
    if (!answer) {
      elements.inputError.textContent = "أدخل حرفًا إنجليزيًا واحدًا من A إلى Z.";
      elements.input.focus();
      return;
    }
    elements.inputError.textContent = "";
    submitAnswer(answer, "manual");
  }

  function combinedLevelPerformance() {
    const right = session.summarizeEye("right");
    const left = session.summarizeEye("left");
    return engine.DIFFICULTY_LEVELS.map((level, index) => ({
      label: level.label,
      correct: right.levels[index].correct + left.levels[index].correct,
      total: right.levels[index].total + left.levels[index].total,
    }));
  }

  function renderResults() {
    const right = session.summarizeEye("right");
    const left = session.summarizeEye("left");

    function renderEye(summary, score, accuracy, highest, levels, description) {
      score.textContent = `${summary.correct} من ${summary.total}`;
      accuracy.textContent = `${summary.accuracy}%`;
      highest.textContent = summary.highestCompletedLevel;
      levels.replaceChildren(...summary.levels.map((level) => {
        const item = document.createElement("li");
        item.textContent = `${level.label}: ${level.correct} من ${level.total}`;
        return item;
      }));
      description.textContent = summary.approximateResult;
    }

    renderEye(right, elements.rightScore, elements.rightAccuracy, elements.rightHighest, elements.rightLevels, elements.rightResult);
    renderEye(left, elements.leftScore, elements.leftAccuracy, elements.leftHighest, elements.leftLevels, elements.leftResult);
    elements.save.disabled = false;
    elements.save.textContent = "حفظ في السجل";
    elements.resultStatus.textContent = "";
    elements.resultStatus.classList.remove("is-error");
  }

  function createResultRecord() {
    const snapshot = session.snapshot();
    const right = session.summarizeEye("right");
    const left = session.summarizeEye("left");
    const total = snapshot.trials.length;
    const correct = snapshot.trials.filter((trial) => trial.isCorrect).length;
    const inputMethods = [...new Set(snapshot.trials.map((trial) => trial.inputMethod))];
    const methodLabels = inputMethods.map((method) => method === "voice" ? "الصوت" : "لوحة المفاتيح");
    const levels = combinedLevelPerformance();
    const formatEyeLevels = (summary) => summary.levels.map((level) => `${level.label}: ${level.correct}/${level.total}`).join(" · ");
    const explanation = "نتيجة فحص شاشة إرشادي لتعرّف الحروف. لا تمثل قياس Snellen أو LogMAR، ولا تستبدل فحص اختصاصي العيون أو وصفة النظارة.";
    return {
      type: "letter-vision",
      title: "اختبار تمييز الحروف",
      date: completedAt || new Date().toISOString(),
      summary: `${correct} إجابات صحيحة من ${total} في اختبار تمييز الحروف`,
      resultData: {
        examinationType: "تمييز الحروف الإنجليزية",
        inputMethods: methodLabels.join("، "),
        questionCount: total,
        correct,
        incorrect: total - correct,
        rightEye: `${right.correct} من ${right.total} (${right.accuracy}%) · ${right.approximateResult}`,
        rightCorrect: right.correct,
        rightTotal: right.total,
        rightAccuracy: right.accuracy,
        rightHighestLevel: right.highestCompletedLevel,
        leftEye: `${left.correct} من ${left.total} (${left.accuracy}%) · ${left.approximateResult}`,
        leftCorrect: left.correct,
        leftTotal: left.total,
        leftAccuracy: left.accuracy,
        leftHighestLevel: left.highestCompletedLevel,
        rightLevelPerformance: formatEyeLevels(right),
        leftLevelPerformance: formatEyeLevels(left),
        levelPerformance: levels.map((level) => `${level.label}: ${level.correct}/${level.total}`).join(" · "),
        interpretation: explanation,
        explanation,
        reviewData: {
          kind: "letter-vision",
          summary: `الصحيح: ${correct} · غير الصحيح: ${total - correct}`,
          trials: snapshot.trials.map((trial) => ({
            questionNumber: trial.questionNumber,
            label: `${trial.eye === "right" ? "العين اليمنى" : "العين اليسرى"} · مستوى ${trial.level}`,
            userAnswer: trial.userAnswer,
            correctAnswer: trial.letter,
            isCorrect: trial.isCorrect,
            stimulus: { letter: trial.letter, level: trial.level },
          })),
        },
      },
    };
  }

  async function saveResult() {
    if (!window.EyeCareHistory || savedRecordId) return;
    const reportName = await window.EyeCareExamTools?.requestReportName(
      window.EyeCareExamTools.defaultReportName("اختبار تمييز الحروف", completedAt),
    );
    if (!reportName) return;
    const record = createResultRecord();
    record.title = reportName;
    const saved = window.EyeCareHistory.addRecord(record);
    if (!saved.success) {
      elements.resultStatus.textContent = saved.error;
      elements.resultStatus.classList.add("is-error");
      return;
    }
    savedRecordId = saved.record.id;
    elements.save.disabled = true;
    elements.save.textContent = "تم الحفظ";
    elements.resultStatus.textContent = "حُفظت النتيجة محليًا في هذا المتصفح.";
  }

  async function downloadPdf() {
    if (!window.EyeCareReport) return;
    elements.resultStatus.textContent = "جارٍ تجهيز ملف PDF…";
    const result = await window.EyeCareReport.downloadPdf(createResultRecord());
    elements.resultStatus.textContent = result.success ? `تم تنزيل ${result.filename}.` : result.error;
    elements.resultStatus.classList.toggle("is-error", !result.success);
  }

  function restart() {
    answerSequence += 1;
    voiceController?.stop();
    session = engine.createSession();
    answerMode = "manual";
    inputLocked = false;
    completedAt = null;
    savedRecordId = null;
    clearVoiceFeedback();
    setMode("manual");
    showStep("intro");
  }

  elements.startButtons.forEach((button) => button.addEventListener("click", () => {
    setMode(button.dataset.letterStart);
    showStep("preparation");
  }));
  elements.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.letterMode)));
  elements.manualForm.addEventListener("submit", (event) => { event.preventDefault(); submitManualAnswer(); });
  elements.input.addEventListener("input", () => { elements.input.value = elements.input.value.toUpperCase(); });
  elements.voiceToggle.addEventListener("click", () => {
    if (voiceController?.isActive()) voiceController.stop();
    else voiceController?.start(true);
  });
  elements.manualFallback.addEventListener("click", () => setMode("manual"));
  elements.restartLink.addEventListener("click", restart);
  elements.save.addEventListener("click", saveResult);
  elements.pdf.addEventListener("click", downloadPdf);
  elements.review.addEventListener("click", () => window.EyeCareExamTools?.openReview(createResultRecord().resultData.reviewData, "مراجعة اختبار تمييز الحروف"));

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-letter-action]")?.dataset.letterAction;
    if (action === "ready") beginEye();
    if (action === "start-left" && session.startLeftEye()) beginEye();
    if (action === "restart") restart();
  });
  window.addEventListener("pagehide", () => voiceController?.destroy());

  updateProgress();
})();
