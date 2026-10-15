(() => {
  "use strict";

  const diseases = Array.isArray(window.EYECARE_DISEASES) ? window.EYECARE_DISEASES : [];
  const content = document.querySelector("[data-disease-content]");
  const notFound = document.querySelector("[data-disease-not-found]");
  const diseaseId = new URLSearchParams(window.location.search).get("id");
  const disease = diseases.find((item) => item.id === diseaseId);
  const translated = disease ? (window.EYECARE_DISEASES_AR?.[disease.id] || {}) : {};
  const copy = disease ? { ...disease, ...translated } : null;

  if (!content || !notFound) return;

  if (!disease) {
    content.hidden = true;
    notFound.hidden = false;
    document.title = "الحالة غير موجودة | EyeCare AI";
    return;
  }

  const setText = (selector, value) => {
    content.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const populateList = (selector, items) => {
    const list = content.querySelector(selector);
    if (!list) return;
    list.replaceChildren(...items.map((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      return listItem;
    }));
  };

  setText("[data-detail-name]", copy.name);
  setText("[data-detail-short-name]", copy.shortName === copy.name ? "دليل أمراض العين" : copy.shortName);
  setText("[data-detail-description]", copy.shortDescription);
  setText("[data-detail-overview]", copy.overview);
  setText("[data-detail-exam-type]", disease.examinationType);
  setText("[data-detail-care]", copy.whenToSeekCare);

  const badge = content.querySelector("[data-detail-badge]");
  badge.textContent = disease.examinationType;
  badge.classList.add(`condition-badge--${disease.examinationType.toLowerCase()}`);

  populateList("[data-detail-symptoms]", copy.symptoms);
  populateList("[data-detail-risks]", copy.riskFactors);
  populateList("[data-detail-examination]", copy.examination);
  populateList("[data-detail-treatment]", copy.generalTreatment);

  document.title = `${copy.name} | EyeCare AI`;
})();
