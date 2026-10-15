(() => {
  "use strict";

  const root = document.querySelector("[data-reaction-test]");
  if (!root) return;

  const validTarget = 5;
  const state = { phase: "idle", trials: [], validTimes: [], timer: null, stimulusAt: null, completedAt: null, savedId: null };
  const steps = [...root.querySelectorAll("[data-step]")];
  const progress = [...root.querySelectorAll("[data-progress]")];
  const stage = root.querySelector(".reaction-stage");
  const stageLabel = root.querySelector("[data-stage-label]");
  const heading = root.querySelector("[data-heading]");
  const instruction = root.querySelector("[data-instruction]");
  const status = root.querySelector("[data-status]");
  const saveStatus = root.querySelector("[data-save-status]");
  const startTrialButton = root.querySelector('[data-action="start-trial"]');

  function showStep(name) {
    steps.forEach((step) => { step.hidden = step.dataset.step !== name; });
    const active = name === "setup" ? 0 : name === "test" ? 1 : 2;
    progress.forEach((item, index) => {
      item.classList.toggle("is-active", index === active);
      item.classList.toggle("is-complete", index < active);
    });
  }

  function updateCounter() {
    root.querySelector("[data-counter]").textContent = `الاستجابة الصالحة ${Math.min(state.validTimes.length + 1, validTarget)} من ${validTarget}`;
  }

  function setStage(mode, label) {
    stage.className = `reaction-stage${mode ? ` is-${mode}` : ""}`;
    stageLabel.textContent = label;
  }

  function startTrial() {
    if (!["idle", "feedback"].includes(state.phase) || state.validTimes.length >= validTarget) return;
    window.clearTimeout(state.timer);
    state.phase = "waiting";
    startTrialButton.disabled = true;
    heading.textContent = "انتظر ظهور الدائرة الخضراء";
    instruction.textContent = "لا تضغط الآن.";
    status.textContent = "";
    setStage("waiting", "انتظر…");
    const delay = 900 + Math.random() * 1300;
    state.timer = window.setTimeout(showStimulus, delay);
  }

  function showStimulus() {
    state.phase = "ready";
    state.stimulusAt = performance.now();
    heading.textContent = "اضغط الآن";
    instruction.textContent = "استخدم المنطقة أو مفتاح المسافة أو مفتاح الإدخال.";
    setStage("ready", "اضغط الآن");
  }

  function respond() {
    if (state.phase === "waiting") {
      window.clearTimeout(state.timer);
      const number = state.trials.length + 1;
      state.trials.push({ questionNumber: number, label: `المحاولة ${number}`, userAnswer: "ضغط قبل ظهور المحفز", correctAnswer: "انتظار ظهور المحفز", isCorrect: false, invalid: true, stimulus: { premature: true } });
      state.phase = "feedback";
      setStage("early", "استجابة مبكرة");
      heading.textContent = "كانت الاستجابة مبكرة";
      instruction.textContent = "هذه المحاولة لا تدخل في النتيجة. حاول مجددًا.";
      status.textContent = "محاولة غير صالحة — انتظر ظهور الدائرة الخضراء.";
      startTrialButton.disabled = false;
      startTrialButton.textContent = "أعد المحاولة";
      return;
    }
    if (state.phase !== "ready") return;
    const elapsed = Math.round(performance.now() - state.stimulusAt);
    const number = state.trials.length + 1;
    state.validTimes.push(elapsed);
    state.trials.push({ questionNumber: number, label: `المحاولة ${number}`, userAnswer: `${elapsed} مللي ثانية`, correctAnswer: "استجابة بعد ظهور المحفز", isCorrect: true, neutral: true, verdict: "استجابة صالحة", stimulus: { premature: false, reactionMs: elapsed } });
    state.phase = "feedback";
    setStage("complete", `${elapsed} مللي ثانية`);
    status.textContent = `سُجلت استجابة صالحة: ${elapsed} مللي ثانية.`;
    if (state.validTimes.length >= validTarget) {
      startTrialButton.disabled = true;
      window.setTimeout(finish, 500);
    } else {
      updateCounter();
      heading.textContent = "تم تسجيل الاستجابة";
      instruction.textContent = "ابدأ المحاولة التالية عندما تكون مستعدًا.";
      startTrialButton.disabled = false;
      startTrialButton.textContent = "المحاولة التالية";
    }
  }

  function summary() {
    const sorted = [...state.validTimes].sort((a, b) => a - b);
    const average = Math.round(state.validTimes.reduce((sum, value) => sum + value, 0) / state.validTimes.length);
    return { median: sorted[Math.floor(sorted.length / 2)], average, premature: state.trials.filter((trial) => trial.invalid).length };
  }

  function finish() {
    state.phase = "complete";
    state.completedAt = new Date().toISOString();
    const result = summary();
    root.querySelector("[data-median]").textContent = String(result.median);
    root.querySelector("[data-average]").textContent = String(result.average);
    root.querySelector("[data-premature]").textContent = String(result.premature);
    const differenceNotice = result.average > result.median * 1.15
      ? "ارتفاع المتوسط عن الوسيط يوحي بأن محاولة بطيئة واحدة أو أكثر رفعت المتوسط."
      : "المتوسط قريب من الوسيط في هذه المحاولات.";
    const prematureNotice = result.premature
      ? `توجد ${result.premature} ${result.premature === 1 ? "محاولة مبكرة لم تدخل" : "محاولات مبكرة لم تدخل"} في الحساب.`
      : "لا توجد محاولات مبكرة خارج الحساب.";
    root.querySelector("[data-interpretation]").textContent = `زمن استجابتك الوسيط ${result.median} مللي ثانية (${(result.median / 1000).toFixed(2)} ثانية)، والمتوسط ${result.average} مللي ثانية (${(result.average / 1000).toFixed(2)} ثانية). الوسيط يقلل أثر المحاولات البطيئة جدًا، بينما قد ترفعها قيمة المتوسط. ${prematureNotice} ${differenceNotice} تتأثر النتيجة بالانتباه وطريقة الإدخال وزمن استجابة الجهاز والمتصفح، ولا تصنف مرضًا عصبيًا أو بصريًا.`;
    const validList = root.querySelector("[data-valid-trials]");
    validList.replaceChildren(...state.validTimes.map((time, index) => {
      const item = document.createElement("li");
      item.textContent = `${index + 1}: ${time} مللي ثانية`;
      return item;
    }));
    root.querySelector("[data-invalid-trials]").textContent = result.premature
      ? `المحاولات غير الصالحة: ${result.premature} ضغطات قبل ظهور الإشارة.`
      : "المحاولات غير الصالحة: لا توجد.";
    showStep("results");
  }

  function record() {
    const result = summary();
    return {
      type: "reaction-time",
      title: "اختبار زمن الاستجابة البصرية",
      date: state.completedAt,
      summary: `وسيط ${result.median} مللي ثانية، ${result.premature} استجابات مبكرة`,
      resultData: { ...result, validTrials: validTarget, interpretation: root.querySelector("[data-interpretation]").textContent, reviewData: { kind: "reaction-time", summary: `${validTarget} استجابات صالحة · ${result.premature} استجابات مبكرة`, trials: state.trials } }
    };
  }

  async function save() {
    if (state.savedId) return;
    const name = await EyeCareExamTools.requestReportName(EyeCareExamTools.defaultReportName("اختبار زمن الاستجابة", state.completedAt));
    if (!name) return;
    const item = record();
    item.title = name;
    const result = EyeCareHistory.addRecord(item);
    if (result.success) {
      state.savedId = result.record.id;
      saveStatus.textContent = "حُفظ التقرير محليًا.";
      root.querySelector('[data-action="save"]').disabled = true;
    } else saveStatus.textContent = result.error;
  }

  function reset() {
    window.clearTimeout(state.timer);
    Object.assign(state, { phase: "idle", trials: [], validTimes: [], timer: null, stimulusAt: null, completedAt: null, savedId: null });
    startTrialButton.disabled = false;
    startTrialButton.textContent = "ابدأ المحاولة";
    saveStatus.textContent = "";
    root.querySelector('[data-action="save"]').disabled = false;
    updateCounter();
    setStage("", "في انتظار البدء");
    heading.textContent = "ابدأ المحاولة عندما تكون مستعدًا";
    instruction.textContent = "بعد البدء، لا تضغط حتى يظهر المحفز.";
    showStep("test");
  }

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start-test") reset();
    if (action === "start-trial") startTrial();
    if (action === "stage") respond();
    if (action === "review") EyeCareExamTools.openReview(record().resultData.reviewData, "مراجعة زمن الاستجابة");
    if (action === "save") save();
    if (action === "restart") reset();
  });

  document.addEventListener("keydown", (event) => {
    if ((event.code === "Space" || event.code === "Enter") && (state.phase === "waiting" || state.phase === "ready")) {
      event.preventDefault();
      respond();
    }
  });
})();
