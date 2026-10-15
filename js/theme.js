window.EyeCareTheme = (() => {
  "use strict";

  const STORAGE_KEY = "eyecare_ai_theme";
  let preference = "light";

  function readPreference() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  }

  function iconMarkup(theme) {
    return theme === "dark"
      ? '<path d="M20.2 15.2A8.5 8.5 0 0 1 8.8 3.8 8.5 8.5 0 1 0 20.2 15.2Z"></path>'
      : '<path d="M12 3v2m0 14v2M3 12h2m14 0h2m-3.64-6.36-1.42 1.42M8.06 15.94l-1.42 1.42m0-11.72 1.42 1.42m7.88 8.88 1.42 1.42"></path><circle cx="12" cy="12" r="4"></circle>';
  }

  function applyPreference(value, persist = false) {
    preference = value === "dark" ? "dark" : "light";
    const root = document.documentElement;
    root.dataset.theme = preference;
    root.style.colorScheme = preference;
    if (persist) {
      try { window.localStorage.setItem(STORAGE_KEY, preference); } catch { /* Keep the current page theme. */ }
    }
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const nextTheme = preference === "dark" ? "الفاتح" : "الداكن";
      button.setAttribute("aria-label", `تبديل إلى الوضع ${nextTheme}`);
      button.title = `تبديل إلى الوضع ${nextTheme}`;
      button.querySelector("svg").innerHTML = iconMarkup(preference);
    });
    window.dispatchEvent(new CustomEvent("eyecarethemechange", { detail: { preference, resolvedTheme: preference } }));
  }

  function createThemeControl() {
    const navbar = document.querySelector(".navbar");
    if (!navbar || navbar.querySelector("[data-theme-toggle]")) return;
    const button = document.createElement("button");
    button.className = "theme-toggle";
    button.type = "button";
    button.dataset.themeToggle = "";
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconMarkup(preference)}</svg><span class="visually-hidden">تبديل المظهر</span>`;
    button.addEventListener("click", () => applyPreference(preference === "dark" ? "light" : "dark", true));
    navbar.append(button);
    applyPreference(preference);
  }

  preference = readPreference();
  applyPreference(preference);
  window.addEventListener("storage", (event) => { if (event.key === STORAGE_KEY) applyPreference(readPreference()); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", createThemeControl, { once: true });
  else createThemeControl();
  return Object.freeze({ storageKey: STORAGE_KEY, getPreference: () => preference, getResolvedTheme: () => preference, setPreference: (value) => applyPreference(value, true) });
})();
