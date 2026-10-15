(() => {
  "use strict";

  const storage = window.EyeCareHistory;
  const report = window.EyeCareReport;
  const list = document.querySelector("[data-history-list]");
  if (!storage || !report || !list) return;

  const elements = {
    status: document.querySelector("[data-history-status]"),
    empty: document.querySelector("[data-history-empty]"),
    noMatches: document.querySelector("[data-history-no-matches]"),
    clearButton: document.querySelector("[data-clear-history]"),
    filters: [...document.querySelectorAll("[data-history-filter]")],
    detailsDialog: document.querySelector("[data-details-dialog]"),
    detailTitle: document.querySelector("[data-detail-title]"),
    detailDate: document.querySelector("[data-detail-date]"),
    detailList: document.querySelector("[data-detail-list]"),
    printDetails: document.querySelector("[data-print-details]"),
    confirmDialog: document.querySelector("[data-confirm-dialog]"),
    confirmTitle: document.querySelector("[data-confirm-title]"),
    confirmMessage: document.querySelector("[data-confirm-message]"),
    confirmAccept: document.querySelector("[data-confirm-accept]"),
    confirmCancel: document.querySelector("[data-confirm-cancel]"),
  };

  let records = [];
  let activeFilter = "all";
  let activeDetailId = null;
  let pendingConfirmation = null;

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "التاريخ غير متاح";
    return new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function setStatus(message, isError = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle("is-error", isError);
  }

  function getTypeDetails(type) {
    const types = {
      vision: { short: "VA", label: "فحص حدة النظر" },
      "color-vision": { short: "CV", label: "فحص تمييز الألوان" },
      "contrast-sensitivity": { short: "CS", label: "فحص حساسية التباين" },
      astigmatism: { short: "AS", label: "فحص الاستجماتيزم" },
      "peripheral-vision": { short: "PV", label: "فحص الرؤية الطرفية" },
      "reaction-time": { short: "RT", label: "فحص زمن الاستجابة" },
      "eye-tracking": { short: "ET", label: "تتبع العين" },
      "blink-detection": { short: "BD", label: "اكتشاف الرمش" },
    };
    return types[type] || { short: "EX", label: "فحص عين" };
  }

  function createButton(label, action, recordId, extraClass = "") {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `history-action ${extraClass}`.trim();
    button.dataset.historyAction = action;
    button.dataset.recordId = recordId;
    button.textContent = label;
    return button;
  }

  function createRecordCard(record) {
    const type = getTypeDetails(record.type);
    const card = document.createElement("article");
    card.className = `history-card history-card--${record.type}`;
    card.dataset.recordId = record.id;

    const marker = document.createElement("div");
    marker.className = "history-card__type";
    marker.textContent = type.short;
    marker.setAttribute("aria-label", type.label);

    const content = document.createElement("div");
    content.className = "history-card__content";
    const heading = document.createElement("div");
    heading.className = "history-card__heading";
    const title = document.createElement("h3");
    title.textContent = record.title;
    const date = document.createElement("time");
    date.dateTime = record.date;
    date.textContent = formatDate(record.date);
    heading.append(title, date);
    const summary = document.createElement("p");
    summary.textContent = record.summary;
    content.append(heading, summary);

    const actions = document.createElement("div");
    actions.className = "history-card__actions";
    actions.append(createButton("التفاصيل", "details", record.id));
    if (record.resultData?.reviewData?.trials?.length) {
      actions.append(createButton("مراجعة الإجابات", "review", record.id));
    }
    actions.append(
      createButton("إعادة تسمية", "rename", record.id),
      createButton("تحميل PDF", "download", record.id),
      createButton("حذف", "delete", record.id, "history-action--delete")
    );

    card.append(marker, content, actions);
    return card;
  }

  function renderHistory() {
    const filteredRecords = activeFilter === "all"
      ? records
      : records.filter((record) => record.type === activeFilter);

    list.replaceChildren(...filteredRecords.map(createRecordCard));
    const hasRecords = records.length > 0;
    const hasMatches = filteredRecords.length > 0;
    list.hidden = !hasMatches;
    elements.empty.hidden = hasRecords;
    elements.noMatches.hidden = !hasRecords || hasMatches;
    elements.clearButton.disabled = !hasRecords;
  }

  function refreshHistory() {
    records = storage.getHistory();
    const readError = storage.getLastError();
    if (readError) setStatus(readError, true);
    renderHistory();
  }

  function getDetailRows(record) {
    if (record.type === "vision") {
      return [
        ["العين اليمنى", record.resultData.rightEye || "غير متاح"],
        ["تفسير العين اليمنى", record.resultData.rightInterpretation || "لا يتوفر تفسير تفصيلي لهذه النتيجة القديمة."],
        ["العين اليسرى", record.resultData.leftEye || "غير متاح"],
        ["تفسير العين اليسرى", record.resultData.leftInterpretation || "لا يتوفر تفسير تفصيلي لهذه النتيجة القديمة."],
        ["المعايرة", record.resultData.calibration || "غير متاح"],
        ["قاعدة الاحتساب", record.resultData.scoringRule || "لم تُحفظ قاعدة الاحتساب مع هذا السجل القديم."],
        ["تاريخ الحفظ", formatDate(record.date)],
      ];
    }

    if (record.type === "color-vision") return [
      ["النتيجة", String(record.resultData.score ?? "غير متاح")],
      ["عدد اللوحات", String(record.resultData.total ?? "غير متاح")],
      ["التفسير", record.resultData.interpretation || "غير متاح"],
      ["تاريخ الحفظ", formatDate(record.date)],
    ];

    return [
      ["الملخص", record.summary || "غير متاح"],
      ["التفسير", record.resultData.interpretation || record.resultData.result || "لا يتوفر تفسير تفصيلي محفوظ لهذه النتيجة القديمة."],
      ["تاريخ الحفظ", formatDate(record.date)],
    ];
  }

  function openDetails(record) {
    activeDetailId = record.id;
    elements.detailTitle.textContent = record.title;
    elements.detailDate.textContent = formatDate(record.date);
    const detailNodes = [];
    getDetailRows(record).forEach(([label, value]) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const description = document.createElement("dd");
      description.textContent = value;
      detailNodes.push(term, description);
    });
    elements.detailList.replaceChildren(...detailNodes);
    elements.detailsDialog.showModal();
  }

  function closeDetails() {
    if (elements.detailsDialog.open) elements.detailsDialog.close();
    activeDetailId = null;
  }

  function requestConfirmation({ title, message, actionLabel, onConfirm }) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    elements.confirmAccept.textContent = actionLabel;
    pendingConfirmation = onConfirm;
    elements.confirmDialog.showModal();
  }

  function deleteRecord(record) {
    requestConfirmation({
      title: "حذف هذه النتيجة؟",
      message: `سيؤدي ذلك إلى حذف نتيجة ${record.title} من هذا المتصفح نهائيًا.`,
      actionLabel: "حذف النتيجة",
      onConfirm: () => {
        const result = storage.deleteRecord(record.id);
        setStatus(result.success ? "تم حذف النتيجة." : result.error, !result.success);
        refreshHistory();
      },
    });
  }

  function clearAllRecords() {
    requestConfirmation({
      title: "مسح السجل بالكامل؟",
      message: "سيؤدي ذلك إلى حذف جميع نتائج EyeCare AI المحفوظة من هذا المتصفح.",
      actionLabel: "مسح السجل",
      onConfirm: () => {
        const result = storage.clearHistory();
        setStatus(result.success ? "تم مسح السجل." : result.error, !result.success);
        refreshHistory();
      },
    });
  }

  async function renameRecord(record) {
    const nextTitle = await window.EyeCareExamTools?.requestReportName(record.title);
    if (!nextTitle || nextTitle === record.title) return;
    const result = storage.updateRecordTitle(record.id, nextTitle);
    setStatus(result.success ? "تم تحديث اسم التقرير." : result.error, !result.success);
    refreshHistory();
  }

  list.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-action]");
    if (!button) return;
    const record = storage.getRecordById(button.dataset.recordId);
    if (!record) {
      setStatus("هذه النتيجة لم تعد متاحة.", true);
      refreshHistory();
      return;
    }

    if (button.dataset.historyAction === "details") openDetails(record);
    if (button.dataset.historyAction === "review") {
      window.EyeCareExamTools?.openReview(record.resultData.reviewData, record.title);
    }
    if (button.dataset.historyAction === "rename") renameRecord(record);
    if (button.dataset.historyAction === "download") report.downloadPdf(record).then((result) => setStatus(result.success ? `تم تنزيل ${result.filename}.` : result.error, !result.success));
    if (button.dataset.historyAction === "delete") deleteRecord(record);
  });

  elements.filters.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.historyFilter;
      elements.filters.forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderHistory();
    });
  });

  document.querySelectorAll("[data-close-details]").forEach((button) => {
    button.addEventListener("click", closeDetails);
  });

  elements.printDetails.addEventListener("click", () => {
    const record = storage.getRecordById(activeDetailId);
    if (record) report.downloadPdf(record).then((result) => setStatus(result.success ? `تم تنزيل ${result.filename}.` : result.error, !result.success));
    else setStatus("هذه النتيجة لم تعد متاحة.", true);
  });

  elements.clearButton.addEventListener("click", clearAllRecords);
  elements.confirmCancel.addEventListener("click", () => {
    pendingConfirmation = null;
    elements.confirmDialog.close();
  });
  elements.confirmAccept.addEventListener("click", () => {
    const action = pendingConfirmation;
    pendingConfirmation = null;
    elements.confirmDialog.close();
    if (action) action();
  });

  elements.detailsDialog.addEventListener("click", (event) => {
    if (event.target === elements.detailsDialog) closeDetails();
  });
  elements.confirmDialog.addEventListener("click", (event) => {
    if (event.target === elements.confirmDialog) {
      pendingConfirmation = null;
      elements.confirmDialog.close();
    }
  });

  refreshHistory();
})();
