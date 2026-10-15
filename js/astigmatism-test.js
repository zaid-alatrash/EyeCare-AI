(() => {
  "use strict";
  const root = document.querySelector("[data-astigmatism-test]");
  if (!root) return;
  const eyes = ["العين اليمنى", "العين اليسرى"];
  const state = { eye: 0, selected: new Set(), response: null, trials: [], completedAt: null, savedId: null };
  const steps = [...root.querySelectorAll("[data-step]")];
  const progress = [...root.querySelectorAll("[data-progress]")];
  const status = root.querySelector("[data-status]");
  const error = root.querySelector("[data-answer-error]");
  const dial = root.querySelector("[data-dial]");
  const choices = root.querySelector("[data-main-choices]");
  const lineSelection = root.querySelector("[data-line-selection]");

  [0, 30, 60, 90, 120, 150].forEach((angle, index) => {
    const line = document.createElement("button");
    line.type = "button";
    line.className = "astigmatism-line";
    line.dataset.lineId = `line-${index + 1}`;
    line.style.setProperty("--angle", `${angle}deg`);
    line.setAttribute("aria-label", `الخط ${index + 1}`);
    line.setAttribute("aria-pressed", "false");
    dial.appendChild(line);
  });

  function showStep(name) {
    steps.forEach((step) => { step.hidden = step.dataset.step !== name; });
    const active = name === "results" ? 2 : name === "test" ? 1 : 0;
    progress.forEach((item, index) => { item.classList.toggle("is-active", index === active); item.classList.toggle("is-complete", index < active); });
  }

  function resetSelection() {
    state.selected.clear();
    state.response = null;
    root.querySelectorAll("[data-line-id]").forEach((line) => line.setAttribute("aria-pressed", "false"));
    choices.hidden = false;
    lineSelection.hidden = true;
    error.textContent = "";
  }

  function renderEye() {
    root.querySelector("[data-eye-label]").textContent = eyes[state.eye];
    root.querySelector("[data-eye-question]").textContent = `اختبر ${eyes[state.eye]} الآن مع تثبيت النظر في المركز.`;
    resetSelection();
  }

  function interpretationFor(response) {
    if (response === "equal") return "لم تلاحظ اختلافًا واضحًا بين الخطوط. هذه نتيجة متوقعة في هذا الفحص، لكنها لا تستبعد الاستجماتيزم.";
    if (response === "different") return "لاحظت اختلافًا في وضوح بعض الخطوط. قد يرتبط ذلك بالاستجماتيزم أو بعوامل أخرى، ويحتاج التأكد إلى فحص نظر لدى مختص.";
    return "لم تتمكن من تحديد وضوح الخطوط بشكل مؤكد. يمكنك إعادة الفحص.";
  }

  function answerLabel(response, count = 0) {
    if (response === "equal") return "نعم، جميع الخطوط متساوية";
    if (response === "different") return `بعض الخطوط أوضح أو أغمق (${count} محددة)`;
    return "لست متأكدًا";
  }

  function recordAnswer(response) {
    const lineIds = [...state.selected];
    state.trials.push({ questionNumber: state.eye + 1, label: eyes[state.eye], userAnswer: answerLabel(response, lineIds.length), subjective: true, neutral: true, interpretation: interpretationFor(response), stimulus: { eye: eyes[state.eye], response, lineIds } });
    if (state.eye === 0) { state.eye = 1; renderEye(); } else finish();
  }

  function finish() {
    state.completedAt = new Date().toISOString();
    const results = root.querySelector("[data-results]");
    results.replaceChildren(...state.trials.map((trial) => {
      const card = document.createElement("article");
      const eye = document.createElement("span");
      const value = document.createElement("strong");
      eye.textContent = trial.label; value.textContent = trial.userAnswer; card.append(eye, value); return card;
    }));
    root.querySelector("[data-interpretation]").textContent = `اللابؤرية خطأ انكساري قد يجعل بعض اتجاهات الخطوط أوضح أو أغمق من غيرها، لكن هذا الرسم لا يقيس درجتها أو محورها. ${state.trials
      .map((trial) => `${trial.label}: ${trial.interpretation}`)
      .join(" ")}`;
    showStep("results");
  }

  function record() {
    return { type: "astigmatism", title: "فحص الاستجماتيزم", date: state.completedAt, summary: state.trials.map((trial) => `${trial.label}: ${trial.userAnswer}`).join(" · "), resultData: { interpretation: root.querySelector("[data-interpretation]").textContent, reviewData: { kind: "astigmatism", summary: "استجابتان ذاتيتان لكلتا العينين", trials: state.trials } } };
  }

  async function save() {
    if (state.savedId) return;
    const name = await EyeCareExamTools.requestReportName(EyeCareExamTools.defaultReportName("فحص الاستجماتيزم", state.completedAt));
    if (!name) return;
    const item = record(); item.title = name;
    const result = EyeCareHistory.addRecord(item);
    if (result.success) { state.savedId = result.record.id; status.textContent = "حُفظ التقرير محليًا."; root.querySelector('[data-action="save"]').disabled = true; } else status.textContent = result.error;
  }

  function restart() { Object.assign(state, { eye: 0, trials: [], completedAt: null, savedId: null }); resetSelection(); status.textContent = ""; root.querySelector('[data-action="save"]').disabled = false; showStep("setup"); }

  root.addEventListener("click", (event) => {
    const line = event.target.closest("[data-line-id]");
    if (line && state.response === "different") { const id = line.dataset.lineId; state.selected.has(id) ? state.selected.delete(id) : state.selected.add(id); line.setAttribute("aria-pressed", String(state.selected.has(id))); }
    const response = event.target.closest("[data-response]")?.dataset.response;
    if (response === "different") { state.response = response; choices.hidden = true; lineSelection.hidden = false; dial.querySelector("button")?.focus(); }
    if (response === "equal" || response === "unsure") recordAnswer(response);
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action === "start") { showStep("test"); renderEye(); }
    if (action === "cancel-lines") resetSelection();
    if (action === "confirm-lines") { if (!state.selected.size) error.textContent = "حدد خطًا واحدًا على الأقل."; else recordAnswer("different"); }
    if (action === "review") EyeCareExamTools.openReview(record().resultData.reviewData, "مراجعة فحص الاستجماتيزم");
    if (action === "save") save();
    if (action === "restart") restart();
  });
})();
