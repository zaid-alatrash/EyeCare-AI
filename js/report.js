window.EyeCareReport = (() => {
  "use strict";

  const DISCLAIMER = "هذه النتيجة تعليمية وليست تشخيصًا طبيًا، ولا تستبدل فحص أو علاج اختصاصي العيون.";
  const scriptUrl = document.currentScript?.src || window.location.href;
  const JSPD_URL = new URL("../assets/vendor/jspdf/jspdf.umd.min.js", scriptUrl).href;
  const FONT_URL = new URL("../assets/fonts/NotoSansArabic-Regular.ttf", scriptUrl).href;
  let libraryPromise = null;
  let fontBase64Promise = null;

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "التاريخ غير متاح";
    return new Intl.DateTimeFormat("ar", { dateStyle: "long", timeStyle: "short" }).format(date);
  }

  function getReportDefinition(record) {
    const data = record.resultData || {};
    const definitions = {
      vision: {
        title: "تقرير اختبار حدة النظر",
        rows: [
          ["نتيجة العين اليمنى", data.rightEye || "غير متاح"],
          ["تفسير العين اليمنى", data.rightInterpretation || "لا يتوفر تفسير تفصيلي لهذه النتيجة القديمة."],
          ["نتيجة العين اليسرى", data.leftEye || "غير متاح"],
          ["تفسير العين اليسرى", data.leftInterpretation || "لا يتوفر تفسير تفصيلي لهذه النتيجة القديمة."],
          ["حالة المعايرة", data.calibration || "غير متاح"],
          ["قاعدة الاحتساب", data.scoringRule || "لم تُحفظ قاعدة الاحتساب مع هذا السجل القديم."],
        ],
      },
      "color-vision": { title: "تقرير اختبار رؤية الألوان", rows: [["الإجابات الصحيحة", `${data.score ?? "غير متاح"} من ${data.total ?? "غير متاح"}`]] },
      "contrast-sensitivity": { title: "تقرير حساسية التباين", rows: [["الإجابات الصحيحة", `${data.score ?? "غير متاح"} من ${data.total ?? "غير متاح"}`]] },
      astigmatism: { title: "تقرير فحص اللابؤرية", rows: [["ملخص الاستجابات", record.summary || "غير متاح"]] },
      "peripheral-vision": { title: "تقرير مجال الرؤية المحيطي", rows: [["الأهداف الملحوظة", data.detected ?? "غير متاح"], ["الأهداف الفائتة", data.missed ?? "غير متاح"], ["الضغطات الخاطئة", data.falsePositives ?? "غير متاح"]] },
      "reaction-time": { title: "تقرير زمن الاستجابة البصرية", rows: [["الزمن الوسيط", Number.isFinite(data.median) ? `${data.median} مللي ثانية` : "غير متاح"], ["المتوسط", Number.isFinite(data.average) ? `${data.average} مللي ثانية` : "غير متاح"], ["الاستجابات المبكرة", data.premature ?? "غير متاح"]] },
      "eye-tracking": { title: "تقرير تتبع العين التجريبي", rows: [["حالة القياس", data.reliable ? "قابل للتفسير تجريبيًا" : "غير موثوق"], ["المشاهدات الصالحة", data.validObservations ?? "غير متاح"], ["المشاهدات المتطابقة", data.matchedObservations ?? "غير متاح"], ["الاتساق التقديري", Number.isFinite(data.consistency) ? `${data.consistency}%` : "غير متاح"]] },
      "blink-detection": { title: "تقرير اكتشاف الرمش", rows: [["عدد الرمشات", data.totalBlinks ?? "غير متاح"], ["زمن التتبع الصالح", Number.isFinite(data.validObservationSeconds) ? `${data.validObservationSeconds} ثانية` : "غير متاح"], ["المعدل التقديري", Number.isFinite(data.estimatedBlinksPerMinute) ? `${data.estimatedBlinksPerMinute} رمشة/دقيقة` : "غير متاح"], ["جودة القياس", data.measurementQuality || "غير متاح"]] },
    };
    const definition = definitions[record.type] || { title: `تقرير ${record.title || "الفحص"}`, rows: [["ملخص النتيجة", record.summary || "غير متاح"]] };
    return { ...definition, explanation: data.interpretation || data.explanation || "لا يتوفر تفسير تفصيلي محفوظ لهذه النتيجة القديمة." };
  }

  function loadJsPdf() {
    if (window.jspdf?.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!libraryPromise) {
      libraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = JSPD_URL;
        script.onload = () => window.jspdf?.jsPDF ? resolve(window.jspdf.jsPDF) : reject(new Error("تعذر تهيئة مكتبة PDF."));
        script.onerror = () => reject(new Error("تعذر تحميل مكتبة PDF المحلية."));
        document.head.appendChild(script);
      });
    }
    return libraryPromise;
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return window.btoa(binary);
  }

  function loadArabicFont() {
    if (!fontBase64Promise) {
      fontBase64Promise = fetch(FONT_URL).then((response) => {
        if (!response.ok) throw new Error("تعذر تحميل الخط العربي المحلي.");
        return response.arrayBuffer();
      }).then(arrayBufferToBase64);
    }
    return fontBase64Promise;
  }

  function safeFilename(record) {
    const date = new Date(record.date || Date.now());
    const stamp = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
    return `EyeCare_AI_Report_${stamp}.pdf`;
  }

  function isArabic(text) { return /[\u0600-\u06ff]/.test(String(text)); }

  function preparePdfText(value, doc) {
    const content = String(value ?? "");
    if (!isArabic(content)) return content;
    // jsPDF's bidi switch reverses mixed Arabic/numeric strings. Shape Arabic
    // explicitly, keep logical order, and rely on right alignment for layout.
    return typeof doc.processArabic === "function" ? doc.processArabic(content) : content;
  }

  async function buildPdf(record) {
    if (!record || !record.type) throw new Error("بيانات التقرير غير متاحة.");
    const [JsPdf, fontBase64] = await Promise.all([loadJsPdf(), loadArabicFont()]);
    const doc = new JsPdf({ orientation: "portrait", unit: "mm", format: "a4", compress: true, putOnlyUsedFonts: true });
    doc.addFileToVFS("NotoSansArabic-Regular.ttf", fontBase64);
    doc.addFont("NotoSansArabic-Regular.ttf", "NotoSansArabic", "normal");
    doc.setFont("NotoSansArabic", "normal");
    doc.setLanguage("ar");
    doc.setProperties({ title: record.title || "EyeCare AI Report", subject: "EyeCare AI examination report", author: "EyeCare AI", creator: "EyeCare AI" });
    const definition = getReportDefinition(record);
    const pageWidth = 210;
    const margin = 18;
    const right = pageWidth - margin;
    const contentWidth = pageWidth - margin * 2;
    let y = 18;

    function drawBrand(includeTitle = true) {
      doc.setFillColor(13, 113, 128);
      doc.roundedRect(margin, y, contentWidth, includeTitle ? 31 : 14, 3, 3, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("NotoSansArabic", "normal");
      doc.setR2L(false);
      doc.setFontSize(15);
      doc.text("EyeCare AI", right - 6, y + 9, { align: "right" });
      if (includeTitle) { doc.setR2L(false); doc.setFontSize(13); doc.text(preparePdfText(definition.title, doc), right - 6, y + 22, { align: "right" }); }
      y += includeTitle ? 38 : 20;
    }

    function addPageIfNeeded(height = 16) {
      if (y + height <= 279) return;
      doc.addPage();
      y = 18;
      drawBrand(false);
    }

    function text(value, options = {}) {
      const content = String(value ?? "");
      const size = options.size || 10;
      const lineHeight = options.lineHeight || size * 0.48;
      doc.setFont("NotoSansArabic", "normal");
      doc.setFontSize(size);
      doc.setTextColor(...(options.color || [31, 58, 70]));
      doc.setR2L(false);
      const lines = doc.splitTextToSize(preparePdfText(content, doc), options.width || contentWidth);
      addPageIfNeeded(lines.length * lineHeight + 4);
      doc.text(lines, options.x || right, y, { align: options.align || "right", baseline: "top" });
      y += lines.length * lineHeight + (options.after ?? 3);
    }

    function rule() { doc.setDrawColor(205, 220, 225); doc.line(margin, y, right, y); y += 6; }

    drawBrand();
    text(`تاريخ الفحص: ${formatDate(record.date)}`, { size: 9, color: [83, 105, 113] });
    const patientName = record.patientName || record.resultData?.patientName;
    if (patientName) text(`اسم المريض: ${patientName}`, { size: 9, color: [83, 105, 113] });
    rule();
    text("ملخص الفحص", { size: 12, color: [13, 113, 128], after: 2 });
    text(record.summary || record.title || "غير متاح", { size: 11, after: 7 });
    text("تفاصيل النتيجة", { size: 12, color: [13, 113, 128], after: 4 });
    definition.rows.forEach(([label, value]) => { addPageIfNeeded(18); text(label, { size: 9, color: [83, 105, 113], after: 1 }); text(value, { size: 10, after: 5 }); });
    rule();
    text("ماذا تعني النتيجة؟", { size: 12, color: [13, 113, 128], after: 3 });
    text(definition.explanation, { size: 10, lineHeight: 5.4, after: 7 });
    addPageIfNeeded(28);
    doc.setFillColor(240, 248, 249);
    doc.roundedRect(margin, y, contentWidth, 25, 3, 3, "F");
    y += 5;
    text("تنبيه طبي", { x: right - 5, width: contentWidth - 10, size: 10, color: [13, 113, 128], after: 1 });
    text(DISCLAIMER, { x: right - 5, width: contentWidth - 10, size: 9, color: [60, 80, 88], after: 1 });
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      doc.setFont("NotoSansArabic", "normal");
      doc.setFontSize(8);
      doc.setTextColor(105, 125, 132);
      doc.setR2L(false);
      doc.text("EyeCare AI", margin, 291, { align: "left" });
      doc.text(preparePdfText(`الصفحة ${page} من ${pages}`, doc), right, 291, { align: "right" });
    }
    return doc;
  }

  async function downloadPdf(record) {
    try {
      const doc = await buildPdf(record);
      const filename = safeFilename(record);
      doc.save(filename);
      return { success: true, filename };
    } catch (error) {
      console.error("[EyeCare PDF]", error);
      return { success: false, error: error?.message || "تعذر إنشاء ملف PDF." };
    }
  }

  return Object.freeze({ buildPdf, downloadPdf, printReport: downloadPdf, getReportDefinition });
})();
