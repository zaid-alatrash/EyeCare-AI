(() => {
  "use strict";
  const root = document.querySelector("[data-demo-chat]");
  if (!root) return;
  const messages = root.querySelector("[data-chat-messages]");
  const input = root.querySelector("[data-chat-input]");
  const fallback = "لا تتوفر إجابة لهذا السؤال حاليًا. يمكنك اختيار أحد الموضوعات المقترحة أو مراجعة دليل أمراض العين.";
  const replies = {
    oct: "فحص OCT يصوّر مقاطع دقيقة من طبقات الشبكية. في هذه المنصة يمكنك رفع الصورة ومعاينتها، أما التحليل الآلي فما زال مؤجلًا حتى ربط نموذج معتمد.",
    fundus: "صورة قاع العين تُظهر الشبكية والعصب البصري والأوعية. جودة الإضاءة والتركيز مهمة، والتفسير الطبي يجب أن يجريه اختصاصي.",
    conditions: "من الحالات الشائعة: قصر النظر، طول النظر، الاستجماتيزم، الساد، والزرق. تشابه الأعراض لا يكفي للتشخيص، لذلك يلزم فحص مهني.",
    exams: "تتضمن المنصة فحوصًا تعليمية لحدة النظر والألوان والتباين والرؤية المحيطية، إضافة إلى رفع صور OCT وقاع العين. نتائجها إرشادية وليست تشخيصًا."
  };
  function add(text, user = false) {
    const item = document.createElement("div");
    item.className = `chat-message${user ? " chat-message--user" : ""}`;
    item.textContent = text;
    messages.append(item);
    messages.scrollTop = messages.scrollHeight;
  }
  function reply(key, question) { if (question) add(question, true); window.setTimeout(() => add(replies[key] || fallback), 180); }
  root.addEventListener("click", (event) => { const button = event.target.closest("[data-question]"); if (button) reply(button.dataset.question, button.textContent.trim()); });
  root.querySelector("form").addEventListener("submit", (event) => { event.preventDefault(); const value = input.value.trim(); if (!value) return; add(value, true); input.value = ""; window.setTimeout(() => add(fallback), 180); });
  window.EyeCareDemoChat = Object.freeze({ replies, fallback });
})();
