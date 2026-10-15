(() => {
  "use strict";
  document.addEventListener("click", (event) => {
    const details = event.target.closest("[data-appointment-details]");
    if (details) document.querySelector(details.dataset.appointmentDetails)?.showModal();
    if (event.target.closest("[data-dialog-close]")) event.target.closest("dialog")?.close();
    const conversation = event.target.closest("[data-conversation]");
    if (conversation) {
      document.querySelectorAll("[data-conversation]").forEach((button) => button.setAttribute("aria-selected", String(button === conversation)));
      document.querySelectorAll("[data-thread]").forEach((thread) => { thread.hidden = thread.dataset.thread !== conversation.dataset.conversation; });
    }
  });
  const form = document.querySelector("[data-demo-message-form]");
  form?.addEventListener("submit", (event) => {
    event.preventDefault(); const input = form.querySelector("input"); const value = input.value.trim(); if (!value) return;
    const active = document.querySelector("[data-thread]:not([hidden]) [data-chat-messages]");
    const message = document.createElement("div"); message.className = "chat-message chat-message--user"; message.innerHTML = `<span></span><small>الآن · محلي فقط</small>`; message.querySelector("span").textContent = value; active?.append(message); input.value = "";
  });
})();
