window.EyeCareExamTools = (() => {
  "use strict";

  function formatDate(value = new Date()) {
    return new Intl.DateTimeFormat("ar", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value));
  }

  function defaultReportName(label, date = new Date()) {
    return `${label} - ${formatDate(date)}`;
  }

  function ensureNameDialog() {
    let dialog = document.querySelector("[data-report-name-dialog]");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "exam-dialog";
    dialog.dataset.reportNameDialog = "";
    dialog.innerHTML = `
      <form method="dialog" class="exam-dialog__body" data-report-name-form novalidate>
        <div><p class="eyebrow">حفظ في السجل</p><h2>اسم التقرير</h2></div>
        <label class="exam-field">اسم واضح يساعدك على تمييز النتيجة
          <input type="text" maxlength="80" autocomplete="off" data-report-name-input>
        </label>
        <p class="exam-field-error" role="alert" data-report-name-error></p>
        <div class="exam-dialog__actions">
          <button class="button button--secondary" value="cancel" type="button" data-report-name-cancel>إلغاء</button>
          <button class="button button--primary" value="confirm" type="submit">حفظ التقرير</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function requestReportName(initialValue) {
    const dialog = ensureNameDialog();
    const form = dialog.querySelector("[data-report-name-form]");
    const input = dialog.querySelector("[data-report-name-input]");
    const error = dialog.querySelector("[data-report-name-error]");
    const cancel = dialog.querySelector("[data-report-name-cancel]");
    input.value = String(initialValue || "").trim();
    error.textContent = "";

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        form.removeEventListener("submit", onSubmit);
        cancel.removeEventListener("click", onCancel);
        dialog.removeEventListener("cancel", onCancel);
        if (dialog.open) dialog.close();
        resolve(value);
      };
      const onSubmit = (event) => {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          error.textContent = "أدخل اسمًا للتقرير قبل الحفظ.";
          input.focus();
          return;
        }
        finish(value);
      };
      const onCancel = (event) => {
        event?.preventDefault();
        finish(null);
      };
      form.addEventListener("submit", onSubmit);
      cancel.addEventListener("click", onCancel);
      dialog.addEventListener("cancel", onCancel);
      dialog.showModal();
      input.focus();
      input.select();
    });
  }

  function ensureReviewDialog() {
    let dialog = document.querySelector("[data-answer-review-dialog]");
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "exam-dialog exam-review-dialog";
    dialog.dataset.answerReviewDialog = "";
    dialog.innerHTML = `
      <div class="exam-dialog__body">
        <header class="exam-review__header">
          <div><p class="eyebrow">مراجعة الإجابات</p><h2 data-review-title>تفاصيل المحاولات</h2></div>
          <button class="exam-dialog__close" type="button" aria-label="إغلاق" data-review-close>×</button>
        </header>
        <div class="exam-review__summary" data-review-summary></div>
        <article class="exam-review__trial">
          <div class="exam-review__trial-head"><strong data-review-counter></strong><span data-review-verdict></span></div>
          <div class="exam-review__stimulus" data-review-stimulus></div>
          <dl class="exam-review__answers">
            <div><dt>إجابتك</dt><dd data-review-user></dd></div>
            <div data-review-explanation><dt data-review-correct-label>الإجابة الصحيحة</dt><dd data-review-correct></dd></div>
          </dl>
        </article>
        <div class="exam-review__nav">
          <button class="button button--secondary" type="button" data-review-prev>السابق</button>
          <button class="button button--secondary" type="button" data-review-next>التالي</button>
          <button class="button button--primary" type="button" data-review-close>إغلاق</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function seededRandom(seed) {
    let value = Number(seed) >>> 0;
    return () => {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function renderColorPlate(container, stimulus) {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    canvas.setAttribute("aria-label", `لوحة الرقم ${stimulus.answer}`);
    const context = canvas.getContext("2d");
    const mask = document.createElement("canvas");
    mask.width = 320;
    mask.height = 320;
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    maskContext.fillStyle = "#000";
    maskContext.font = `900 ${String(stimulus.answer).length > 1 ? 136 : 172}px Arial`;
    maskContext.textAlign = "center";
    maskContext.textBaseline = "middle";
    maskContext.fillText(stimulus.answer, 160, 165);
    const maskData = maskContext.getImageData(0, 0, 320, 320).data;
    const random = seededRandom(stimulus.seed);
    context.fillStyle = "#f7f4ea";
    context.fillRect(0, 0, 320, 320);
    context.save();
    context.beginPath();
    context.arc(160, 160, 146, 0, Math.PI * 2);
    context.clip();
    context.fillStyle = "#d8c7a5";
    context.fillRect(0, 0, 320, 320);
    for (let row = 1; row < 26; row += 1) {
      for (let column = 1; column < 26; column += 1) {
        const x = column * 12.5 + (random() - 0.5) * 5.5;
        const y = row * 12.5 + (random() - 0.5) * 5.5;
        if (Math.hypot(x - 160, y - 160) > 142) continue;
        const pixel = (Math.round(y) * 320 + Math.round(x)) * 4 + 3;
        const palette = maskData[pixel] > 90 ? stimulus.figure : stimulus.background;
        context.beginPath();
        context.arc(x, y, 3.5 + random() * 3.75, 0, Math.PI * 2);
        context.fillStyle = palette[Math.floor(random() * palette.length)];
        context.fill();
      }
    }
    context.restore();
    container.appendChild(canvas);
  }

  function renderStimulus(container, trial, kind) {
    container.replaceChildren();
    const stimulus = trial.stimulus || {};
    if (kind === "color-vision" && stimulus.seed) {
      renderColorPlate(container, stimulus);
      return;
    }
    if (["manual-vision", "contrast-sensitivity"].includes(kind)) {
      const symbol = document.createElement("div");
      symbol.className = "exam-review__e";
      symbol.dataset.direction = stimulus.direction || trial.correctAnswer;
      symbol.textContent = "E";
      if (kind === "contrast-sensitivity") symbol.style.opacity = String(stimulus.contrast ?? 1);
      container.appendChild(symbol);
      return;
    }
    if (kind === "astigmatism") {
      const dial = document.createElement("div");
      dial.className = "exam-review__dial";
      dial.innerHTML = "<span></span>";
      container.append(dial, document.createTextNode(stimulus.eye || ""));
      return;
    }
    if (kind === "peripheral-vision") {
      const map = document.createElement("div");
      map.className = "exam-review__field";
      map.innerHTML = "<span class=\"exam-review__fixation\">+</span>";
      if (stimulus.position) {
        const target = document.createElement("i");
        target.style.left = `${stimulus.position.x}%`;
        target.style.top = `${stimulus.position.y}%`;
        map.appendChild(target);
      }
      container.appendChild(map);
      return;
    }
    const pulse = document.createElement("div");
    pulse.className = "exam-review__pulse";
    pulse.textContent = stimulus.reactionMs ? `${Math.round(stimulus.reactionMs)} ms` : "استجابة مبكرة";
    container.appendChild(pulse);
  }

  function openReview(reviewData, title = "مراجعة الإجابات") {
    if (!reviewData?.trials?.length) return false;
    const dialog = ensureReviewDialog();
    const trials = reviewData.trials;
    let index = 0;
    const correctCount = trials.filter((trial) => trial.isCorrect).length;
    const invalidCount = trials.filter((trial) => trial.invalid).length;
    dialog.querySelector("[data-review-title]").textContent = title;
    dialog.querySelector("[data-review-summary]").textContent = reviewData.summary
      || `الصحيح: ${correctCount} · غير الصحيح: ${trials.length - correctCount - invalidCount}${invalidCount ? ` · غير صالح: ${invalidCount}` : ""}`;
    const render = () => {
      const trial = trials[index];
      const subjective = Boolean(trial.subjective || reviewData.kind === "astigmatism");
      dialog.querySelector("[data-review-counter]").textContent = trial.label || `السؤال ${trial.questionNumber || index + 1} من ${trials.length}`;
      const verdict = dialog.querySelector("[data-review-verdict]");
      verdict.hidden = subjective;
      if (!subjective) {
        verdict.textContent = trial.neutral ? (trial.verdict || "استجابة ذاتية") : trial.invalid ? "محاولة غير صالحة" : trial.isCorrect ? "إجابة صحيحة" : "إجابة غير صحيحة";
        verdict.className = trial.neutral || trial.invalid ? "is-neutral" : trial.isCorrect ? "is-correct" : "is-incorrect";
      }
      dialog.querySelector("[data-review-user]").textContent = trial.userAnswer ?? "لا توجد إجابة";
      const explanation = dialog.querySelector("[data-review-explanation]");
      const correctLabel = dialog.querySelector("[data-review-correct-label]");
      const correctValue = dialog.querySelector("[data-review-correct]");
      if (subjective) {
        correctLabel.textContent = "ماذا تعني إجابتك؟";
        correctValue.textContent = trial.interpretation || (trial.stimulus?.directions?.length
          ? "سجّلت اختلافًا في وضوح بعض الخطوط لهذه العين."
          : "لم تسجل اختلافًا في وضوح الخطوط لهذه العين.");
        explanation.hidden = false;
      } else {
        correctLabel.textContent = "الإجابة الصحيحة";
        correctValue.textContent = trial.correctAnswer ?? "—";
        explanation.hidden = false;
      }
      renderStimulus(dialog.querySelector("[data-review-stimulus]"), trial, reviewData.kind);
      dialog.querySelector("[data-review-prev]").disabled = index === 0;
      dialog.querySelector("[data-review-next]").disabled = index === trials.length - 1;
    };
    const close = () => dialog.close();
    dialog.querySelectorAll("[data-review-close]").forEach((button) => button.onclick = close);
    dialog.querySelector("[data-review-prev]").onclick = () => { index -= 1; render(); };
    dialog.querySelector("[data-review-next]").onclick = () => { index += 1; render(); };
    render();
    dialog.showModal();
    return true;
  }

  return Object.freeze({ defaultReportName, requestReportName, openReview });
})();
