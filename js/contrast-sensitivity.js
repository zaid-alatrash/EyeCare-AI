(() => {
  "use strict";
  const root = document.querySelector("[data-contrast-test]");
  if (!root) return;
  const levels = [1, 0.55, 0.32, 0.18, 0.11, 0.07];
  const orientations = ["right", "up", "left", "down", "right", "left"];
  const labels = { up: "أعلى", down: "أسفل", left: "يسار", right: "يمين" };
  const state = { index: 0, trials: [], completedAt: null, savedId: null };
  const steps = [...root.querySelectorAll("[data-step]")];
  const progress = [...root.querySelectorAll("[data-progress]")];
  const symbol = root.querySelector("[data-symbol]");
  const counter = root.querySelector("[data-counter]");
  const status = root.querySelector("[data-status]");
  const order = ["setup", "test", "results", "review"];

  function showStep(name) {
    steps.forEach((step) => { step.hidden = step.dataset.step !== name; });
    const active = name === "results" ? 2 : order.indexOf(name);
    progress.forEach((item, index) => {
      item.classList.toggle("is-active", index === active);
      item.classList.toggle("is-complete", index < active);
    });
  }
  function renderTrial() {
    counter.textContent = `المستوى ${state.index + 1} من ${levels.length}`;
    symbol.dataset.direction = orientations[state.index];
    symbol.style.setProperty("--contrast", levels[state.index]);
  }
  function answer(direction) {
    const correct = orientations[state.index];
    state.trials.push({ questionNumber: state.index + 1, label: `مستوى التباين ${state.index + 1}`, userAnswer: labels[direction], correctAnswer: labels[correct], isCorrect: direction === correct, stimulus: { direction: correct, contrast: levels[state.index] } });
    state.index += 1;
    if (state.index < levels.length) renderTrial();
    else finish();
  }
  function finish() {
    state.completedAt = new Date().toISOString();
    const correct = state.trials.filter((trial) => trial.isCorrect);
    const lowest = correct.length ? Math.min(...correct.map((trial) => trial.stimulus.contrast)) : null;
    root.querySelector("[data-score]").textContent = String(correct.length);
    root.querySelector("[data-lowest]").textContent = lowest ? `${Math.round(lowest * 100)}%` : "غير محدد";
    root.querySelector("[data-interpretation]").textContent = correct.length >= 5
      ? `ميّزت ${correct.length} من ${levels.length} مستويات، ووصلت إلى تباين ${Math.round(lowest * 100)}% في ظروف الشاشة الحالية. تقيس حساسية التباين تمييز شكل عن خلفية متقاربة السطوع. هذا أداء جيد ضمن التمرين فقط، ويتأثر بسطوع الشاشة وإضاءتها ولا يثبت سلامة العين سريريًا.`
      : `ميّزت ${correct.length} من ${levels.length} مستويات${lowest ? `، وكان أقل تباين أجبت عنه بصورة صحيحة ${Math.round(lowest * 100)}%` : ""}، وواجهت صعوبة في البقية. تقيس حساسية التباين تمييز شكل عن خلفية متقاربة السطوع. قد تؤثر الشاشة والسطوع والإضاءة؛ أعد الفحص في ظروف أفضل إذا لزم. لا تُستنتج من هذه النتيجة إصابة بالساد أو مرض شبكي.`;
    showStep("results");
  }
  function record() {
    const score = state.trials.filter((trial) => trial.isCorrect).length;
    return { type: "contrast-sensitivity", title: "اختبار حساسية التباين", date: state.completedAt, summary: `${score} من ${levels.length} إجابات صحيحة`, resultData: { score, total: levels.length, interpretation: root.querySelector("[data-interpretation]").textContent, reviewData: { kind: "contrast-sensitivity", trials: state.trials } } };
  }
  async function save() {
    if (state.savedId) return;
    const name = await EyeCareExamTools.requestReportName(EyeCareExamTools.defaultReportName("فحص حساسية التباين", state.completedAt));
    if (!name) return;
    const item = record(); item.title = name;
    const result = EyeCareHistory.addRecord(item);
    if (result.success) { state.savedId = result.record.id; status.textContent = "حُفظ التقرير محليًا."; root.querySelector('[data-action="save"]').disabled = true; }
    else status.textContent = result.error;
  }
  function restart() { Object.assign(state, { index: 0, trials: [], completedAt: null, savedId: null }); status.textContent = ""; root.querySelector('[data-action="save"]').disabled = false; showStep("setup"); }
  root.addEventListener("click", (event) => {
    const direction = event.target.closest("[data-direction]")?.dataset.direction;
    if (direction) answer(direction);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start") { showStep("test"); renderTrial(); }
    if (action === "review") EyeCareExamTools.openReview(record().resultData.reviewData, "مراجعة حساسية التباين");
    if (action === "save") save();
    if (action === "restart") restart();
  });
})();
