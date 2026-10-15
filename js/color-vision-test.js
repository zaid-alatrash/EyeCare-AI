(() => {
  "use strict";

  const PLATE_SIZE = 640;
  const PLATE_RADIUS = 292;

  // Original project plate definitions. Seeds keep every dot layout stable for the full session.
  const PLATE_DEFINITIONS = [
    { id: "cv-01", answer: "5", seed: 14821, background: ["#d4976d", "#c88263", "#e0ad7d", "#b97861"], figure: ["#6f946e", "#7da078", "#5e835f", "#8ba77b"] },
    { id: "cv-02", answer: "17", seed: 39217, background: ["#8ea47c", "#9dad82", "#7e9874", "#adba8d"], figure: ["#c87969", "#d48772", "#b96c61", "#dc9980"] },
    { id: "cv-03", answer: "42", seed: 76103, background: ["#c69a72", "#d5ac80", "#b88b68", "#e0b98b"], figure: ["#688d82", "#72998d", "#5e8179", "#82a49a"] },
    { id: "cv-04", answer: "3", seed: 25439, background: ["#879b72", "#9aaa7e", "#788e68", "#a8b58c"], figure: ["#b97470", "#c68079", "#a86969", "#d08f82"] },
    { id: "cv-05", answer: "26", seed: 91847, background: ["#b68c71", "#c79c7e", "#a77f69", "#d3aa86"], figure: ["#708d72", "#7c997c", "#638168", "#8ba587"] },
    { id: "cv-06", answer: "9", seed: 53611, background: ["#7d9988", "#8ba493", "#709080", "#9bb0a0"], figure: ["#c98572", "#d4937c", "#b97769", "#dda087"] },
    { id: "cv-07", answer: "64", seed: 68429, background: ["#c08e69", "#d09d73", "#af7f61", "#d9aa7e"], figure: ["#668b75", "#72977f", "#5a806b", "#80a088"] },
    { id: "cv-08", answer: "7", seed: 82763, background: ["#899c79", "#99aa84", "#7a906e", "#a7b591"], figure: ["#c07870", "#ce8678", "#af6c68", "#d59684"] },
    { id: "cv-09", answer: "31", seed: 47591, background: ["#b98a70", "#c99a7c", "#aa7c67", "#d5aa88"], figure: ["#6b8c7f", "#77998a", "#5f8175", "#85a295"] },
    { id: "cv-10", answer: "15", seed: 60337, background: ["#80977a", "#91a486", "#728b6e", "#a0b090"], figure: ["#bd796d", "#ca8877", "#ad6d65", "#d49782"] },
  ];

  const root = document.querySelector("[data-color-test]");
  if (!root) return;

  const state = {
    currentStep: "intro",
    currentQuestion: 0,
    answers: [],
    score: 0,
    completed: false,
    inputLocked: false,
    completedAt: null,
    savedRecordId: null,
  };

  const elements = {
    steps: [...root.querySelectorAll("[data-color-step]")],
    progressSteps: [...document.querySelectorAll("[data-color-progress]")],
    restartLink: document.querySelector("[data-color-restart]"),
    canvas: root.querySelector("[data-color-plate]"),
    questionCounter: root.querySelector("[data-question-counter]"),
    questionProgress: root.querySelector("[data-question-progress]"),
    answerForm: root.querySelector("[data-color-answer-form]"),
    answerInput: root.querySelector("[data-color-answer]"),
    submitButton: root.querySelector("[data-submit-answer]"),
    noNumberButton: root.querySelector("[data-no-number]"),
    answerError: root.querySelector("[data-answer-error]"),
    answeredCount: root.querySelector("[data-answered-count]"),
    correctCount: root.querySelector("[data-correct-count]"),
    interpretationTitle: root.querySelector("[data-interpretation-title]"),
    interpretationText: root.querySelector("[data-interpretation-text]"),
    reviewButton: root.querySelector("[data-color-review]"),
    saveHistoryButton: root.querySelector("[data-color-save-history]"),
    printReportButton: root.querySelector("[data-color-print-report]"),
    resultStatus: root.querySelector("[data-color-result-status]"),
  };

  const plateCache = new Map();

  function createSeededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pickColor(colors, random) {
    return colors[Math.floor(random() * colors.length)];
  }

  function createNumberMask(answer) {
    const mask = document.createElement("canvas");
    mask.width = PLATE_SIZE;
    mask.height = PLATE_SIZE;
    const context = mask.getContext("2d", { willReadFrequently: true });
    const fontSize = answer.length > 1 ? 272 : 345;

    context.clearRect(0, 0, PLATE_SIZE, PLATE_SIZE);
    context.fillStyle = "#000";
    context.font = `900 ${fontSize}px Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(answer, PLATE_SIZE / 2, PLATE_SIZE / 2 + 10);
    return context.getImageData(0, 0, PLATE_SIZE, PLATE_SIZE).data;
  }

  function buildPlate(definition) {
    const plate = document.createElement("canvas");
    plate.width = PLATE_SIZE;
    plate.height = PLATE_SIZE;
    const context = plate.getContext("2d");
    const random = createSeededRandom(definition.seed);
    const maskData = createNumberMask(definition.answer);

    context.fillStyle = "#f7f4ea";
    context.fillRect(0, 0, PLATE_SIZE, PLATE_SIZE);
    context.save();
    context.beginPath();
    context.arc(PLATE_SIZE / 2, PLATE_SIZE / 2, PLATE_RADIUS, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "#d8c7a5";
    context.fillRect(0, 0, PLATE_SIZE, PLATE_SIZE);

    const spacing = 25;
    for (let row = 1; row < PLATE_SIZE / spacing; row += 1) {
      for (let column = 1; column < PLATE_SIZE / spacing; column += 1) {
        const x = column * spacing + (random() - 0.5) * 11;
        const y = row * spacing + (random() - 0.5) * 11;
        const distanceFromCenter = Math.hypot(x - PLATE_SIZE / 2, y - PLATE_SIZE / 2);
        if (distanceFromCenter > PLATE_RADIUS - 8) continue;

        const pixelIndex = (Math.round(y) * PLATE_SIZE + Math.round(x)) * 4 + 3;
        const belongsToNumber = maskData[pixelIndex] > 90;
        const palette = belongsToNumber ? definition.figure : definition.background;
        const radius = 7 + random() * 7.5;

        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = pickColor(palette, random);
        context.globalAlpha = 0.88 + random() * 0.12;
        context.fill();
      }
    }

    context.restore();
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(PLATE_SIZE / 2, PLATE_SIZE / 2, PLATE_RADIUS, 0, Math.PI * 2);
    context.strokeStyle = "rgba(19, 71, 82, 0.12)";
    context.lineWidth = 3;
    context.stroke();
    return plate;
  }

  function renderPlate(questionIndex) {
    if (!plateCache.has(questionIndex)) {
      plateCache.set(questionIndex, buildPlate(PLATE_DEFINITIONS[questionIndex]));
    }

    const context = elements.canvas.getContext("2d");
    context.clearRect(0, 0, PLATE_SIZE, PLATE_SIZE);
    context.drawImage(plateCache.get(questionIndex), 0, 0);
  }

  function getProgressName() {
    if (state.currentStep === "screening") return "screening";
    if (state.currentStep === "results") return "results";
    return "preparation";
  }

  function updateProgress() {
    const order = ["preparation", "screening", "results"];
    const activeIndex = order.indexOf(getProgressName());
    elements.progressSteps.forEach((item) => {
      const index = order.indexOf(item.dataset.colorProgress);
      item.classList.toggle("is-active", index === activeIndex);
      item.classList.toggle("is-complete", index < activeIndex);
    });
  }

  function showStep(stepName, moveFocus = true) {
    state.currentStep = stepName;
    elements.steps.forEach((step) => {
      step.hidden = step.dataset.colorStep !== stepName;
    });
    elements.restartLink.hidden = stepName === "intro";
    updateProgress();

    if (moveFocus) {
      const heading = root.querySelector(`[data-color-step="${stepName}"] h2`);
      if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus();
      }
    }
  }

  function renderQuestion() {
    const questionNumber = state.currentQuestion + 1;
    elements.questionCounter.textContent = `السؤال ${questionNumber} من ${PLATE_DEFINITIONS.length}`;
    elements.questionProgress.style.width = `${(questionNumber / PLATE_DEFINITIONS.length) * 100}%`;
    elements.answerInput.value = "";
    elements.answerError.textContent = "";
    setAnswerControlsDisabled(false);
    renderPlate(state.currentQuestion);
    elements.answerInput.focus();
  }

  function startScreening() {
    state.currentQuestion = 0;
    state.answers = [];
    state.score = 0;
    state.completed = false;
    state.inputLocked = false;
    showStep("screening");
    renderQuestion();
  }

  function setAnswerControlsDisabled(disabled) {
    elements.answerInput.disabled = disabled;
    elements.submitButton.disabled = disabled;
    elements.noNumberButton.disabled = disabled;
  }

  function recordAnswer(response) {
    if (state.inputLocked || state.currentStep !== "screening") return;

    const definition = PLATE_DEFINITIONS[state.currentQuestion];
    const normalizedResponse = response === null ? null : String(Number(response));
    const isCorrect = normalizedResponse === definition.answer;

    state.inputLocked = true;
    setAnswerControlsDisabled(true);
    state.answers.push({
      plateId: definition.id,
      response: normalizedResponse,
      correct: isCorrect,
      questionNumber: state.currentQuestion + 1,
      correctAnswer: definition.answer,
      stimulus: {
        answer: definition.answer,
        seed: definition.seed,
        background: [...definition.background],
        figure: [...definition.figure],
      },
    });
    if (isCorrect) state.score += 1;

    window.setTimeout(() => {
      state.currentQuestion += 1;
      state.inputLocked = false;

      if (state.currentQuestion >= PLATE_DEFINITIONS.length) {
        state.completed = true;
        state.completedAt = new Date().toISOString();
        state.savedRecordId = null;
        renderResults();
        showStep("results");
        return;
      }

      renderQuestion();
    }, 260);
  }

  function submitNumericAnswer() {
    const answer = elements.answerInput.value.trim();
    if (!/^\d{1,2}$/.test(answer)) {
      elements.answerError.textContent = "أدخل الرقم الذي تراه أو اختر «لا أرى رقمًا».";
      elements.answerInput.focus();
      return;
    }

    elements.answerError.textContent = "";
    recordAnswer(answer);
  }

  function getInterpretation(score) {
    // Application-level educational thresholds only. These are not clinically validated diagnostic cutoffs.
    if (score >= 8) {
      return {
        title: "لم تظهر صعوبة واضحة في هذا الاختبار",
        text: "تعرّفت على معظم اللوحات. قد تؤثر إعدادات الشاشة في النتيجة، ولا تستبعد النتيجة وجود مشكلة في رؤية الألوان.",
      };
    }

    if (score >= 4) {
      return {
        title: "ظهرت بعض الصعوبة في تمييز الألوان",
        text: "لم تُحدَّد بعض اللوحات. يُنصح بفحص مهني إذا كان لديك قلق بشأن تمييز الألوان.",
      };
    }

    return {
      title: "ظهرت صعوبة ملحوظة في هذا الاختبار",
      text: "لم تُحدَّد عدة لوحات. قد تؤثر إعدادات الشاشة، ويُنصح بمناقشة القلق المستمر مع اختصاصي العيون.",
    };
  }

  function renderResults() {
    const interpretation = getInterpretation(state.score);
    elements.answeredCount.textContent = String(state.answers.length);
    elements.correctCount.textContent = String(state.score);
    elements.interpretationTitle.textContent = interpretation.title;
    elements.interpretationText.textContent = `أجبت إجابة صحيحة عن ${state.score} من ${PLATE_DEFINITIONS.length} لوحات، ولم تُجب بصورة صحيحة عن ${PLATE_DEFINITIONS.length - state.score}. يقيس التمرين قدرتك على تمييز أرقام مكوّنة من ألوان متقاربة. ${interpretation.text} تتأثر النتيجة بإضاءة المكان ومعايرة الشاشة، وهذه اللوحات المولدة داخل المتصفح ليست فحص إيشيهارا تشخيصيًا ولا تحدد نوع صعوبة الألوان.`;
    elements.saveHistoryButton.disabled = false;
    elements.saveHistoryButton.textContent = "حفظ في السجل";
    elements.resultStatus.textContent = "";
    elements.resultStatus.classList.remove("is-error");
  }

  function createResultRecord() {
    const interpretation = getInterpretation(state.score);
    return {
      type: "color-vision",
      title: "اختبار رؤية الألوان",
      date: state.completedAt || new Date().toISOString(),
      summary: `${state.score} من ${PLATE_DEFINITIONS.length} إجابات صحيحة`,
      resultData: {
        score: state.score,
        total: PLATE_DEFINITIONS.length,
        interpretation: `أجبت إجابة صحيحة عن ${state.score} من ${PLATE_DEFINITIONS.length} لوحات، ولم تُجب بصورة صحيحة عن ${PLATE_DEFINITIONS.length - state.score}. يقيس التمرين تمييز ألوان متقاربة. ${interpretation.text} تتأثر النتيجة بالإضاءة ومعايرة الشاشة، وهذه اللوحات التعليمية ليست فحص إيشيهارا تشخيصيًا.`,
        explanation: "تعكس النتيجة الأداء على لوحات المشروع التعليمية فقط وليست تشخيصًا سريريًا.",
        reviewData: {
          kind: "color-vision",
          summary: `الصحيح: ${state.score} · غير الصحيح: ${PLATE_DEFINITIONS.length - state.score}`,
          trials: state.answers.map((answer) => ({
            questionNumber: answer.questionNumber,
            userAnswer: answer.response ?? "لم أرَ رقمًا",
            correctAnswer: answer.correctAnswer,
            isCorrect: answer.correct,
            stimulus: answer.stimulus,
          })),
        },
      },
    };
  }

  async function saveResultToHistory() {
    if (state.savedRecordId) return;
    if (!window.EyeCareHistory) {
      elements.resultStatus.textContent = "تعذر الوصول إلى السجل، ويمكنك طباعة النتيجة.";
      elements.resultStatus.classList.add("is-error");
      return;
    }

    const reportName = await window.EyeCareExamTools?.requestReportName(
      window.EyeCareExamTools.defaultReportName("فحص الألوان", state.completedAt)
    );
    if (!reportName) return;
    const record = createResultRecord();
    record.title = reportName;
    const saveResult = window.EyeCareHistory.addRecord(record);
    if (!saveResult.success) {
      elements.resultStatus.textContent = saveResult.error || "تعذر حفظ النتيجة.";
      elements.resultStatus.classList.add("is-error");
      return;
    }

    state.savedRecordId = saveResult.record.id;
    elements.saveHistoryButton.disabled = true;
    elements.saveHistoryButton.textContent = "تم الحفظ";
    elements.resultStatus.textContent = "حُفظت النتيجة محليًا في هذا المتصفح.";
    elements.resultStatus.classList.remove("is-error");
  }

  async function printCurrentResult() {
    if (!window.EyeCareReport) {
      elements.resultStatus.textContent = "تعذر تجهيز التقرير للطباعة.";
      elements.resultStatus.classList.add("is-error");
      return;
    }

    elements.resultStatus.textContent = "جارٍ تجهيز ملف PDF…";
    const result = await window.EyeCareReport.downloadPdf(createResultRecord());
    elements.resultStatus.textContent = result.success ? `تم تنزيل ${result.filename}.` : result.error;
    elements.resultStatus.classList.toggle("is-error", !result.success);
  }

  function reviewAnswers() {
    window.EyeCareExamTools?.openReview(createResultRecord().resultData.reviewData, "مراجعة اختبار الألوان");
  }

  function restartTest() {
    Object.assign(state, {
      currentStep: "intro",
      currentQuestion: 0,
      answers: [],
      score: 0,
      completed: false,
      inputLocked: false,
      completedAt: null,
      savedRecordId: null,
    });
    elements.answerInput.value = "";
    elements.answerError.textContent = "";
    elements.resultStatus.textContent = "";
    setAnswerControlsDisabled(false);
    showStep("intro");
  }

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-color-action]")?.dataset.colorAction;
    if (action === "start") showStep("preparation");
    if (action === "ready") startScreening();
    if (action === "restart") restartTest();
  });

  elements.answerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitNumericAnswer();
  });

  elements.noNumberButton.addEventListener("click", () => recordAnswer(null));
  elements.restartLink.addEventListener("click", restartTest);
  elements.reviewButton.addEventListener("click", reviewAnswers);
  elements.saveHistoryButton.addEventListener("click", saveResultToHistory);
  elements.printReportButton.addEventListener("click", printCurrentResult);
  updateProgress();
})();
