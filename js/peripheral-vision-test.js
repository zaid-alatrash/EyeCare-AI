(() => {
  "use strict";

  const root = document.querySelector("[data-peripheral-test]");
  if (!root) return;

  const positions = [
    { id: "top", name: "أعلى", x: 50, y: 16 },
    { id: "top-right", name: "أعلى اليمين", x: 76, y: 25 },
    { id: "right", name: "اليمين", x: 86, y: 50 },
    { id: "bottom-right", name: "أسفل اليمين", x: 76, y: 75 },
    { id: "bottom", name: "أسفل", x: 50, y: 84 },
    { id: "bottom-left", name: "أسفل اليسار", x: 24, y: 75 },
    { id: "left", name: "اليسار", x: 14, y: 50 },
    { id: "top-left", name: "أعلى اليسار", x: 24, y: 25 }
  ];
  const responseWindow = 1200;
  const practicePositions = [positions[0], positions[2], positions[6]];
  const state = { queue: [], index: 0, trials: [], practiceIndex: 0, phase: "idle", timer: null, hideTimer: null, countdownTimer: null, completedAt: null, savedId: null };
  const steps = [...root.querySelectorAll("[data-step]")];
  const progress = [...root.querySelectorAll("[data-progress]")];
  const stage = root.querySelector("[data-stage]");
  const target = root.querySelector("[data-target]");
  const responseButton = root.querySelector('[data-action="respond"]');
  const status = root.querySelector("[data-status]");
  const saveStatus = root.querySelector("[data-save-status]");
  const practiceTarget = root.querySelector("[data-practice-target]");
  const practiceButton = root.querySelector('[data-action="practice-respond"]');
  const practiceStatus = root.querySelector("[data-practice-status]");
  const countdownValue = root.querySelector("[data-peripheral-countdown]");
  const practiceActions = root.querySelector("[data-practice-actions]");
  const practiceComplete = root.querySelector("[data-practice-complete]");
  const practiceTitle = root.querySelector("[data-practice-title]");

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function buildQueue() {
    return shuffle([...positions.map((position) => ({ position })), { position: null }, { position: null }, { position: null }]);
  }

  function showStep(name) {
    steps.forEach((step) => { step.hidden = step.dataset.step !== name; });
    const active = name === "setup" ? 0 : ["practice", "test"].includes(name) ? 1 : 2;
    progress.forEach((item, index) => {
      item.classList.toggle("is-active", index === active);
      item.classList.toggle("is-complete", index < active);
    });
  }

  function clearTimers() {
    window.clearTimeout(state.timer);
    window.clearTimeout(state.hideTimer);
    window.clearInterval(state.countdownTimer);
    state.timer = null;
    state.hideTimer = null;
    state.countdownTimer = null;
  }

  function runCountdown(seconds, label, onComplete) {
    clearTimers();
    state.phase = "countdown";
    practiceTarget.hidden = true;
    practiceButton.disabled = true;
    countdownValue.hidden = false;
    let remaining = seconds;
    countdownValue.textContent = String(remaining);
    practiceTitle.textContent = label;
    root.querySelector("[data-practice-instruction]").textContent = `استعد، سيبدأ ${label.includes("التدريب") ? "التدريب" : "الفحص"} بعد...`;
    state.countdownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(state.countdownTimer);
        state.countdownTimer = null;
        countdownValue.hidden = true;
        onComplete();
      } else countdownValue.textContent = String(remaining);
    }, 1000);
  }

  function beginPracticeTrial() {
    clearTimers();
    state.phase = "practice-preparing";
    const position = practicePositions[state.practiceIndex];
    practiceTarget.hidden = true;
    practiceTarget.classList.remove("is-visible");
    practiceButton.disabled = true;
    practiceActions.hidden = false;
    practiceComplete.hidden = true;
    practiceTitle.textContent = "تدرّب على الاستجابة";
    root.querySelector("[data-practice-counter]").textContent = `تدريب ${state.practiceIndex + 1} من ${practicePositions.length}`;
    root.querySelector("[data-practice-instruction]").textContent = "ثبّت نظرك على +؛ ستظهر نقطة جانبية قصيرة.";
    practiceStatus.textContent = "";
    state.timer = window.setTimeout(() => {
      state.phase = "practice-responding";
      practiceTarget.style.left = `${position.x}%`;
      practiceTarget.style.top = `${position.y}%`;
      practiceTarget.hidden = false;
      requestAnimationFrame(() => practiceTarget.classList.add("is-visible"));
      practiceButton.disabled = false;
      root.querySelector("[data-practice-instruction]").textContent = "اضغط الآن إذا رأيت النقطة، مع إبقاء نظرك على +.";
      state.hideTimer = window.setTimeout(() => { practiceTarget.hidden = true; }, 360);
      state.timer = window.setTimeout(() => completePractice(false), responseWindow);
    }, 450);
  }

  function completePractice(responded) {
    if (state.phase !== "practice-responding") return;
    clearTimers();
    practiceTarget.hidden = true;
    practiceButton.disabled = true;
    state.phase = "practice-feedback";
    practiceStatus.textContent = responded ? "جيد، تم تسجيل الاستجابة التدريبية." : "انتهت نافذة التدريب؛ يمكنك متابعة المحاولة التالية.";
    state.practiceIndex += 1;
    if (state.practiceIndex < practicePositions.length) state.timer = window.setTimeout(beginPracticeTrial, 550);
    else {
      state.phase = "practice-complete";
      practiceTitle.textContent = "اكتمل التدريب";
      root.querySelector("[data-practice-instruction]").textContent = "اكتمل التدريب. هذه المحاولات لا تدخل في النتيجة.";
      practiceActions.hidden = true;
      practiceComplete.hidden = false;
    }
  }

  function beginTrial() {
    clearTimers();
    state.phase = "preparing";
    responseButton.disabled = true;
    target.hidden = true;
    target.classList.remove("is-visible");
    root.querySelector("[data-counter]").textContent = `المحاولة ${state.index + 1} من ${state.queue.length}`;
    root.querySelector("[data-instruction]").textContent = "ثبّت نظرك على علامة + في المنتصف…";
    status.textContent = "";
    state.timer = window.setTimeout(openWindow, 550);
  }

  function openWindow() {
    const trial = state.queue[state.index];
    state.phase = "responding";
    responseButton.disabled = false;
    root.querySelector("[data-instruction]").textContent = "اضغط فقط إذا رأيت هدفًا جانبيًا، دون النظر إليه مباشرة.";
    if (trial.position) {
      target.style.left = `${trial.position.x}%`;
      target.style.top = `${trial.position.y}%`;
      target.hidden = false;
      requestAnimationFrame(() => target.classList.add("is-visible"));
      state.hideTimer = window.setTimeout(() => { target.hidden = true; }, 260);
    }
    state.timer = window.setTimeout(() => completeTrial(false), responseWindow);
  }

  function completeTrial(responded) {
    if (state.phase !== "responding") return;
    const trial = state.queue[state.index];
    clearTimers();
    target.hidden = true;
    responseButton.disabled = true;
    state.phase = "feedback";
    const hadTarget = Boolean(trial.position);
    const isCorrect = hadTarget ? responded : !responded;
    state.trials.push({
      questionNumber: state.index + 1,
      label: hadTarget ? `هدف: ${trial.position.name}` : "محاولة فارغة",
      userAnswer: responded ? "رأيت هدفًا" : "لم أرَ هدفًا",
      correctAnswer: hadTarget ? "يوجد هدف" : "لا يوجد هدف",
      isCorrect,
      stimulus: { position: trial.position, hadTarget }
    });
    status.textContent = responded ? "تم تسجيل الاستجابة." : "انتهت نافذة الاستجابة.";
    state.index += 1;
    if (state.index >= state.queue.length) window.setTimeout(finish, 350);
    else state.timer = window.setTimeout(beginTrial, 450);
  }

  function renderMap() {
    const map = root.querySelector("[data-result-map]");
    map.querySelectorAll(".map-target").forEach((node) => node.remove());
    map.parentElement.querySelectorAll(":scope > .map-legend").forEach((node) => node.remove());
    state.trials.filter((trial) => trial.stimulus.hadTarget).forEach((trial) => {
      const dot = document.createElement("span");
      dot.className = `map-target ${trial.isCorrect ? "is-detected" : "is-missed"}`;
      dot.style.left = `${trial.stimulus.position.x}%`;
      dot.style.top = `${trial.stimulus.position.y}%`;
      dot.title = `${trial.stimulus.position.name}: ${trial.isCorrect ? "تمت الملاحظة" : "لم تتم الملاحظة"}`;
      map.append(dot);
    });
    const legend = document.createElement("div");
    legend.className = "map-legend";
    legend.innerHTML = '<span style="--legend-color:#16835b">تمت ملاحظته</span><span style="--legend-color:#c44949">لم تتم ملاحظته</span>';
    map.after(legend);
  }

  function metrics() {
    const targetTrials = state.trials.filter((trial) => trial.stimulus.hadTarget);
    return {
      detected: targetTrials.filter((trial) => trial.isCorrect).length,
      missed: targetTrials.filter((trial) => !trial.isCorrect).length,
      falsePositives: state.trials.filter((trial) => !trial.stimulus.hadTarget && !trial.isCorrect).length
    };
  }

  function finish() {
    state.phase = "complete";
    state.completedAt = new Date().toISOString();
    const result = metrics();
    root.querySelector("[data-detected]").textContent = String(result.detected);
    root.querySelector("[data-missed]").textContent = String(result.missed);
    root.querySelector("[data-false-positives]").textContent = String(result.falsePositives);
    root.querySelector("[data-interpretation]").textContent = result.detected === 0
      ? `لم تُسجَّل أهداف ملحوظة من أصل 8، وسُجلت ${result.falsePositives} ضغطات بلا هدف. الرؤية الطرفية هي ملاحظة ما يقع خارج مركز النظر. قد تؤثر التعليمات والانتباه والتوقيت وحجم الشاشة؛ أعد الفحص في ظروف مناسبة، واطلب تقييمًا مهنيًا إذا استمرت صعوبة ملاحظة الجوانب. لا يثبت ذلك فقدان مجال الرؤية.`
      : `تمت ملاحظة ${result.detected} من 8 أهداف، وفاتتك ${result.missed}، وسُجلت ${result.falsePositives} ضغطات في محاولات بلا هدف. الرؤية الطرفية هي ملاحظة ما يقع خارج مركز النظر. قد تعود الأهداف الفائتة إلى الانتباه أو التوقيت أو الشاشة، وقد تستحق الصعوبة المتكررة تقييمًا طبيًا، لكن الاختبار لا يشخّص الزرق أو فقدان مجال الرؤية.${result.missed >= 4 ? " أعد الفحص في ظروف مناسبة قبل تفسير النتيجة." : ""}`;
    renderMap();
    showStep("results");
  }

  function record() {
    const result = metrics();
    return {
      type: "peripheral-vision",
      title: "فحص مجال الرؤية المحيطي",
      date: state.completedAt,
      summary: `${result.detected} من 8 أهداف ملحوظة، ${result.falsePositives} ضغطات خاطئة`,
      resultData: { ...result, totalTargets: 8, interpretation: root.querySelector("[data-interpretation]").textContent, reviewData: { kind: "peripheral-vision", trials: state.trials } }
    };
  }

  async function save() {
    if (state.savedId) return;
    const name = await EyeCareExamTools.requestReportName(EyeCareExamTools.defaultReportName("فحص مجال الرؤية", state.completedAt));
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

  function startRealTest() {
    clearTimers();
    Object.assign(state, { queue: buildQueue(), index: 0, trials: [], phase: "idle", completedAt: null, savedId: null });
    saveStatus.textContent = "";
    root.querySelector('[data-action="save"]').disabled = false;
    showStep("test");
    beginTrial();
  }

  function startPractice() {
    clearTimers();
    Object.assign(state, { practiceIndex: 0, trials: [], completedAt: null, savedId: null });
    practiceActions.hidden = false;
    practiceComplete.hidden = true;
    practiceStatus.textContent = "";
    showStep("practice");
    runCountdown(5, "التدريب", beginPracticeTrial);
  }

  function startRealCountdown() {
    practiceComplete.hidden = true;
    practiceActions.hidden = false;
    runCountdown(3, "الفحص الحقيقي", startRealTest);
  }

  function backToInstructions() {
    clearTimers();
    state.phase = "idle";
    practiceTarget.hidden = true;
    countdownValue.hidden = true;
    showStep("setup");
  }

  function restart() { backToInstructions(); }

  root.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start") startPractice();
    if (action === "practice-respond") completePractice(true);
    if (action === "start-real") startRealCountdown();
    if (action === "back-to-instructions") backToInstructions();
    if (action === "respond") completeTrial(true);
    if (action === "review") EyeCareExamTools.openReview(record().resultData.reviewData, "مراجعة مجال الرؤية");
    if (action === "save") save();
    if (action === "restart") restart();
  });

  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && state.phase === "responding") {
      event.preventDefault();
      completeTrial(true);
    }
    if (event.code === "Space" && state.phase === "practice-responding") {
      event.preventDefault();
      completePractice(true);
    }
  });
  window.addEventListener("pagehide", clearTimers);
})();
