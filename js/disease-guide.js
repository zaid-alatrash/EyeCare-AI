(() => {
  "use strict";

  const diseases = Array.isArray(window.EYECARE_DISEASES) ? window.EYECARE_DISEASES : [];
  const arabicCopy = window.EYECARE_DISEASES_AR || {};
  const searchInput = document.querySelector("[data-disease-search]");
  const filterButtons = [...document.querySelectorAll("[data-disease-filter]")];
  const grid = document.querySelector("[data-disease-grid]");
  const resultsText = document.querySelector("[data-results-text]");
  const emptyState = document.querySelector("[data-disease-empty]");
  let activeFilter = "All";

  if (!searchInput || !grid || !resultsText || !emptyState) return;

  const createDiseaseCard = (disease) => {
    const copy = { ...disease, ...(arabicCopy[disease.id] || {}) };
    const article = document.createElement("article");
    article.className = "disease-card";

    const top = document.createElement("div");
    top.className = "disease-card__top";

    const marker = document.createElement("span");
    marker.className = "disease-card__marker";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = disease.examinationType === "OCT" ? "OCT" : "FUN";

    const badge = document.createElement("span");
    badge.className = `condition-badge condition-badge--${disease.examinationType.toLowerCase()}`;
    badge.textContent = disease.examinationType;

    top.append(marker, badge);

    const heading = document.createElement("h2");
    heading.textContent = copy.name;

    if (disease.shortName !== disease.name) {
      const abbreviation = document.createElement("span");
      abbreviation.className = "disease-card__abbreviation";
      abbreviation.textContent = copy.shortName;
      heading.prepend(abbreviation);
    }

    const description = document.createElement("p");
    description.textContent = copy.shortDescription;

    const link = document.createElement("a");
    link.className = "disease-card__link";
    link.href = `disease-details.html?id=${encodeURIComponent(disease.id)}`;
    link.innerHTML = "عرض التفاصيل <span aria-hidden=\"true\">←</span>";
    link.setAttribute("aria-label", `عرض تفاصيل ${copy.name}`);

    article.append(top, heading, description, link);
    return article;
  };

  const render = () => {
    const query = searchInput.value.trim().toLocaleLowerCase();
    const matches = diseases.filter((disease) => {
      const matchesFilter = activeFilter === "All" || disease.examinationType === activeFilter;
      const copy = arabicCopy[disease.id] || {};
      const searchableText = `${disease.name} ${disease.shortName} ${disease.shortDescription} ${copy.name || ""} ${copy.shortName || ""}`.toLocaleLowerCase();
      return matchesFilter && searchableText.includes(query);
    });

    grid.replaceChildren(...matches.map(createDiseaseCard));
    emptyState.hidden = matches.length !== 0;
    grid.hidden = matches.length === 0;

    resultsText.textContent = `عرض ${matches.length} ${matches.length === 1 ? "حالة" : "حالات"}`;
  };

  searchInput.addEventListener("input", render);

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFilter = button.dataset.diseaseFilter;
      filterButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });
      render();
    });
  });

  render();
})();
