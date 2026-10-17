"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pages = ["chatbot.html", "patient-dashboard.html", "doctor-dashboard.html", "messages.html", "appointments.html"];
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, "pages", page), "utf8");
  assert.match(html, /<html lang="ar" dir="rtl">/, `${page} must use Arabic RTL`);
  assert.match(html, /theme\.js/, `${page} must load the shared theme`);
  assert.match(html, /portal\.css/, `${page} must load the shared portal styles`);
  assert.match(html, /data-nav/, `${page} must use the shared navigation hook`);
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.doesNotMatch(index, /id="how-it-works"|class="section about"/);
for (const clutter of ["متاح محليًا", "متاح الآن", "أدوات تعليمية", "وحدتا تصوير"]) {
  assert.doesNotMatch(index, new RegExp(clutter), `homepage must not contain redundant phrase: ${clutter}`);
}
assert.equal((index.match(/class="service-card__visual"/g) || []).length, 8, "the original service cards must each have a visual");
for (const duplicate of ["بوابة المريض", "لوحة الطبيب", "المساعد الطبي الذكي", "الرسائل", "المواعيد", "السجل والتقارير", "اختبار النظر الفوري"]) {
  assert.doesNotMatch(index.match(/<div class="services-grid">[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/)?.[0] || "", new RegExp(`<h3>${duplicate}</h3>`));
}
assert.equal((index.match(/<h3>تتبع العين واكتشاف الرمش<\/h3>/g) || []).length, 1, "tracking and blink must share one service card");
assert.ok(fs.existsSync(path.join(root, "assets", "images", "service-illustrations.svg")), "service illustration sprite must exist");

const report = fs.readFileSync(path.join(root, "js", "report.js"), "utf8");
assert.match(report, /async function downloadPdf/);
assert.match(report, /NotoSansArabic-Regular\.ttf/);
assert.match(report, /doc\.processArabic/);
assert.doesNotMatch(report, /printPaper|window\.print/, "reports must not invoke the browser print dialog");

const chatbot = fs.readFileSync(path.join(root, "js", "chatbot.js"), "utf8");
for (const topic of ["oct", "fundus", "conditions", "exams"]) assert.match(chatbot, new RegExp(`${topic}:`));
assert.match(chatbot, /لا تتوفر إجابة لهذا السؤال حاليًا/);

const main = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
for (const label of ["الرئيسية", "التحليل الذكي", "خدمات العيادة", "بوابة المرضى والأطباء", "المساعد الطبي الذكي", "التواصل", "السجل"]) {
  assert.match(main, new RegExp(label), `shared navigation must include ${label}`);
}
assert.match(main, /new URL\(href, root\)/);
assert.match(main, /\["oct-examination\.html", "fundus-examination\.html"\][\s\S]*?"examinations"/);

const theme = fs.readFileSync(path.join(root, "js", "theme.js"), "utf8");
assert.match(theme, /data-theme-toggle/);
assert.doesNotMatch(theme, /data-theme-select|\["system"/);

for (const file of ["index.html", ...fs.readdirSync(path.join(root, "pages")).filter((item) => item.endsWith(".html")).map((item) => `pages/${item}`)]) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  assert.match(html, /data-nav/, `${file} must contain navigation markup`);
  assert.match(html, /js\/main\.js/, `${file} must load shared navigation logic`);
}
console.log("Shared navigation, theme toggle, Arabic RTL portal pages, and chatbot content passed.");
