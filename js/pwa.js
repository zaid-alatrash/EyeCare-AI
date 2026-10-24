(() => {
  "use strict";

  const script = document.currentScript;
  if (!script || !["http:", "https:"].includes(location.protocol) || !window.isSecureContext) return;

  // Keep direct file:// use free of manifest fetch errors, while enabling the
  // manifest normally on localhost and HTTPS deployments.
  const manifest = document.querySelector('link[rel="manifest"][data-pwa-href]');
  if (manifest) manifest.href = manifest.dataset.pwaHref;

  const root = new URL("../", script.src);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(new URL("sw.js", root), {
        scope: root.pathname,
        updateViaCache: "none"
      }).catch((error) => console.warn("[EyeCare PWA] Offline support unavailable:", error));
    });
  }

  const standalone = window.matchMedia("(display-mode: standalone)");
  const installed = () => standalone.matches || navigator.standalone === true;
  const footer = document.querySelector(".site-footer__inner, .footer__inner");
  if (!footer || installed()) return;

  let pendingPrompt = null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "small-button";
  button.textContent = "تثبيت التطبيق";
  button.hidden = true;
  button.dataset.pwaInstall = "";
  footer.append(button);

  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(navigator.userAgent)
    && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
  let guidance = null;

  if (isiOS && isSafari) {
    guidance = document.createElement("details");
    guidance.className = "pwa-install-guide";
    const summary = document.createElement("summary");
    summary.textContent = "إضافة EyeCare إلى الشاشة الرئيسية";
    const text = document.createElement("p");
    text.textContent = "في Safari، افتح قائمة المشاركة ثم اختر «إضافة إلى الشاشة الرئيسية»، وبعدها اضغط «إضافة».";
    guidance.append(summary, text);
    footer.append(guidance);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    if (installed()) return;
    event.preventDefault();
    pendingPrompt = event;
    button.hidden = false;
  });

  button.addEventListener("click", async () => {
    if (!pendingPrompt) return;
    const prompt = pendingPrompt;
    pendingPrompt = null;
    button.hidden = true;
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      console.warn("[EyeCare PWA] Install prompt unavailable:", error);
    }
  });

  const hideInstall = () => {
    pendingPrompt = null;
    button.hidden = true;
    if (guidance) guidance.hidden = true;
  };
  window.addEventListener("appinstalled", hideInstall);
  standalone.addEventListener?.("change", () => {
    if (installed()) hideInstall();
  });
})();
