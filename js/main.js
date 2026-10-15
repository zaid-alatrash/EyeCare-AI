(() => {
  "use strict";

  function projectRoot() {
    return new URL(location.pathname.includes("/pages/") ? "../" : "./", location.href);
  }

  function normalizeNavigation() {
    const nav = document.querySelector("[data-nav]");
    if (!nav) return null;
    const root = projectRoot();
    const links = [
      ["الرئيسية", "index.html", "home"],
      ["الفحوصات", "index.html#examinations", "examinations"],
      ["خدمات العيادة", "index.html#clinic-services", "services"],
      ["بوابة المرضى والأطباء", "pages/patient-dashboard.html", "portal"],
      ["المساعد الطبي الذكي", "pages/chatbot.html", "assistant"],
      ["التواصل", "pages/messages.html", "messages"],
      ["السجل", "pages/history.html", "history"],
    ];
    const file = location.pathname.split("/").pop() || "index.html";
    const active = file === "index.html" ? "home"
      : ["patient-dashboard.html", "doctor-dashboard.html", "appointments.html"].includes(file) ? "portal"
      : file === "chatbot.html" ? "assistant"
      : file === "messages.html" ? "messages"
      : file === "history.html" ? "history" : "services";
    nav.innerHTML = links.map(([label, href, key]) => `<a${key === active ? ' class="is-active" aria-current="page"' : ""} href="${new URL(href, root).href}">${label}</a>`).join("");
    return nav;
  }

  function addExamIntroduction() {
    const file = location.pathname.split("/").pop();
    const content = {
      "oct-examination.html": ["تحليل صورة OCT", "يعرض صورة مقطعية لطبقات الشبكية للمراجعة.", "ارفع صورة واضحة ثم راجعها قبل الحفظ.", "تصنيف الصورة الطبي يحتاج إلى ربط نموذج الذكاء الاصطناعي لاحقًا."],
      "fundus-examination.html": ["تحليل صورة قاع العين", "يعرض صورة الشبكية والعصب البصري للمراجعة.", "ارفع صورة واضحة ومضاءة جيدًا.", "لا يتوفر تصنيف طبي آلي قبل ربط نموذج الذكاء الاصطناعي."],
      "vision-test.html": ["فحص حدة النظر", "يقيس تمييز اتجاه حرف E لكل عين.", "اضبط المسافة واتبع اتجاه الرمز مع تغطية عين واحدة.", "الشاشة والمسافة والإضاءة تؤثر في الدقة ولا تشكل وصفة أو تشخيصًا."],
      "color-vision-test.html": ["فحص رؤية الألوان", "يقيس القدرة على تمييز أرقام ضمن لوحات لونية.", "اختر الرقم الظاهر في كل لوحة مع إضاءة مريحة.", "اللوحات مولدة داخل المتصفح وليست فحص إيشيهارا تشخيصيًا."],
      "astigmatism-test.html": ["فحص الاستجماتيزم", "يقارن وضوح الخطوط الشعاعية لكل عين.", "غطِّ عينًا دون ضغط وانظر إلى مركز الخطوط ثم قارن وضوحها.", "اختلاف الوضوح لا يؤكد التشخيص، وتساوي الخطوط لا ينفيه."],
      "peripheral-vision-test.html": ["فحص الرؤية المحيطية", "يراقب ملاحظة أهداف جانبية مع تثبيت النظر على المركز.", "انظر إلى علامة + واستجب فقط عند ظهور الهدف.", "التوقيت والشاشة وفهم التعليمات قد تؤثر في النتيجة."],
      "contrast-sensitivity-test.html": ["فحص حساسية التباين", "يقيس تمييز رمز بصري عند مستويات تباين مختلفة.", "اضبط سطوع الشاشة واختر اتجاه الرمز بهدوء.", "جودة الشاشة والإضاءة تؤثر في الأداء ولا تثبت اضطرابًا طبيًا."],
      "reaction-time-test.html": ["فحص زمن الاستجابة البصرية", "يقيس سرعة الاستجابة لإشارة مرئية.", "انتظر ظهور الإشارة ثم اضغط بسرعة؛ لا تضغط قبل ظهورها.", "هو تمرين استجابة بصري وليس تشخيصًا عصبيًا أو عينيًا."],
      "eye-tracking-test.html": ["تتبع العين واكتشاف الرمش", "يتحقق من توافق اتجاه النظر مع أهداف ظاهرة ويعدّ دورات الرمش.", "اجلس أمام الكاميرا بإضاءة متوازنة وثبّت رأسك نسبيًا.", "لا يقيس موضع النظر على الشاشة بدقة سريرية ولا يشخص أمراض العين."],
    }[file];
    const main = document.querySelector("main");
    if (!content || !main || main.querySelector("[data-exam-introduction]")) return;
    const intro = document.createElement("aside");
    intro.className = "exam-introduction";
    intro.dataset.examIntroduction = "";
    intro.innerHTML = `<div class="container"><strong>قبل البدء: ${content[0]}</strong><dl><div><dt>ما الذي يقيسه؟</dt><dd>${content[1]}</dd></div><div><dt>كيف أجريه؟</dt><dd>${content[2]}</dd></div><div><dt>الحدود</dt><dd>${content[3]}</dd></div></dl></div>`;
    main.prepend(intro);
  }

  function addResultMeaningHeadings() {
    document.querySelectorAll("[data-interpretation], [data-tracking-explanation], [data-blink-explanation]").forEach((item) => {
      if (item.previousElementSibling?.matches("[data-result-meaning]")) return;
      const heading = document.createElement("h3");
      heading.className = "result-meaning__title";
      heading.dataset.resultMeaning = "";
      heading.textContent = "ماذا تعني نتيجتك؟";
      item.before(heading);
    });
  }

  const header = document.querySelector("[data-header]");
  const nav = normalizeNavigation();
  addExamIntroduction();
  addResultMeaningHeadings();
  const navToggle = document.querySelector("[data-nav-toggle]");
  const currentYear = document.querySelector("[data-current-year]");
  const closeNavigation = () => {
    if (!nav || !navToggle) return;
    nav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "فتح قائمة التنقل");
    document.body.classList.remove("nav-open");
  };

  if (nav && navToggle) {
    navToggle.addEventListener("click", () => {
      const isOpen = navToggle.getAttribute("aria-expanded") === "true";
      nav.classList.toggle("is-open", !isOpen);
      navToggle.setAttribute("aria-expanded", String(!isOpen));
      navToggle.setAttribute("aria-label", isOpen ? "فتح قائمة التنقل" : "إغلاق قائمة التنقل");
      document.body.classList.toggle("nav-open", !isOpen);
    });
    nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeNavigation));
    window.addEventListener("resize", () => { if (window.innerWidth > 700) closeNavigation(); });
  }

  if (header) {
    const updateHeader = () => header.classList.toggle("is-scrolled", window.scrollY > 8);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }
  if (currentYear) currentYear.textContent = String(new Date().getFullYear());
})();
