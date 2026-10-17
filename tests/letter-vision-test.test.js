"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const engine = require(path.join(__dirname, "..", "js", "letter-test-engine.js"));

assert.deepEqual(engine.DISPLAY_LETTERS, ["A", "F", "H", "K", "L", "O", "R", "U", "V", "X"]);
assert.equal(engine.ANSWER_LETTERS.length, 26);
for (const excluded of ["B", "P", "D", "T", "M", "N"]) assert.equal(engine.DISPLAY_LETTERS.includes(excluded), false);

const letterCases = new Map([
  ["ay", "A"], ["bee", "B"], ["see", "C"], ["sea", "C"], ["dee", "D"], ["ee", "E"],
  ["ef", "F"], ["eff", "F"], ["gee", "G"], ["aitch", "H"], ["eye", "I"], ["jay", "J"], ["kay", "K"],
  ["el", "L"], ["ell", "L"], ["em", "M"], ["en", "N"], ["oh", "O"], ["pee", "P"], ["cue", "Q"],
  ["are", "R"], ["ess", "S"], ["tee", "T"], ["you", "U"], ["vee", "V"], ["double you", "W"],
  ["ex", "X"], ["why", "Y"], ["zee", "Z"], ["zed", "Z"],
]);
letterCases.forEach((expected, phrase) => assert.equal(engine.mapTranscriptToLetter(phrase), expected, phrase));
Object.entries(engine.LETTER_ALIASES).forEach(([letter, aliases]) => {
  aliases.forEach((alias) => assert.equal(engine.mapTranscriptToLetter(alias), letter, `${alias} -> ${letter}`));
});
const canonicalSpokenNames = [
  "ay", "bee", "see", "dee", "ee", "eff", "gee", "aitch", "eye", "jay", "kay", "el", "em",
  "en", "oh", "pee", "cue", "are", "ess", "tee", "you", "vee", "double you", "ex", "why", "zee",
];
engine.ANSWER_LETTERS.forEach((letter, index) => {
  assert.equal(engine.mapTranscriptToLetter(letter), letter, `direct letter ${letter}`);
  assert.equal(engine.mapTranscriptToLetter(canonicalSpokenNames[index]), letter, `spoken name ${letter}`);
  assert.equal(engine.mapTranscriptToLetter(`letter ${letter.toLowerCase()}`), letter, `letter template ${letter}`);
  assert.equal(engine.mapTranscriptToLetter(`the letter ${letter}`), letter, `the-letter template ${letter}`);
  assert.equal(engine.mapTranscriptToLetter(`it's ${letter}`), letter, `contraction template ${letter}`);
  assert.equal(engine.mapTranscriptToLetter(`it is ${letter.toLowerCase()}`), letter, `it-is template ${letter}`);
});
assert.equal(engine.mapTranscriptToLetter("  THE   LETTER   F!!! "), "F");
assert.equal(engine.mapTranscriptToLetter("It’s You."), "U");
assert.equal(engine.mapTranscriptToLetter("the letter eff"), "F");
for (const unsafe of [
  "a or x", "see or ess", "the letter c or s", "letter see or ess", "it is c or s",
  "the letter", "the letter f please", "hello there", "please choose you", "", "   ",
]) assert.equal(engine.mapTranscriptToLetter(unsafe), null, unsafe);
assert.equal(engine.normalizeManualLetter(" k "), "K");
assert.equal(engine.normalizeManualLetter("b"), "B");
assert.equal(engine.normalizeManualLetter("P"), "P");
assert.equal(engine.normalizeManualLetter("z"), "Z");
assert.equal(engine.normalizeManualLetter("AA"), null);
assert.equal(engine.normalizeManualLetter("7"), null);
assert.equal(engine.normalizeManualLetter("@"), null);
assert.equal(engine.normalizeManualLetter(""), null);

const randomValues = [0, 0, 0.2, 0.2, 0.4, 0.4, 0.6, 0.6];
let randomIndex = 0;
const sequence = engine.createLetterSequence(20, () => randomValues[randomIndex++ % randomValues.length]);
assert.equal(sequence.length, 20);
for (let index = 1; index < sequence.length; index += 1) assert.notEqual(sequence[index], sequence[index - 1], "letters must not repeat immediately");

const session = engine.createSession({ random: () => 0 });
const firstTrial = session.nextTrial();
assert.deepEqual(session.nextTrial(), firstTrial, "the active question must remain reproducible");
const observedSizes = [];
let outcome;
for (let index = 0; index < engine.DIFFICULTY_LEVELS.length * engine.TRIALS_PER_LEVEL; index += 1) {
  const trial = session.nextTrial();
  observedSizes.push(trial.fontSize);
  outcome = session.submit(trial.letter, index % 2 ? "voice" : "manual", trial.letter);
}
assert.equal(outcome.status, "eye-complete");
assert.equal(outcome.summary.correct, 12);
assert.equal(outcome.summary.accuracy, 100);
assert.equal(outcome.summary.highestCompletedLevel, engine.DIFFICULTY_LEVELS.at(-1).label);
assert.ok(observedSizes[0] > observedSizes.at(-1), "letters must shrink as difficulty increases");
assert.equal(session.startLeftEye(), true);
for (let index = 0; index < engine.DIFFICULTY_LEVELS.length * engine.TRIALS_PER_LEVEL; index += 1) {
  const trial = session.nextTrial();
  outcome = session.submit(index === 0 ? "Z" : trial.letter, "manual");
}
assert.equal(outcome.status, "complete");
assert.equal(session.summarizeEye("left").incorrect, 1);
assert.equal(session.summarizeEye("left").accuracy, 92);
assert.equal(session.snapshot().trials.length, 24);

const outsideDisplaySession = engine.createSession({ random: () => 0 });
outsideDisplaySession.nextTrial();
const interpretedWrongAnswer = engine.mapTranscriptToLetter("the letter C");
const outsideDisplayAnswer = outsideDisplaySession.submit(interpretedWrongAnswer, "voice", "the letter C");
assert.equal(outsideDisplayAnswer.trial.isCorrect, false, "a recognized A-Z voice answer outside the display set must count as incorrect");

const displayedRSession = engine.createSession({ random: () => 0.6 });
assert.equal(displayedRSession.nextTrial().letter, "R");
const spokenXForR = displayedRSession.submit(engine.mapTranscriptToLetter("X"), "voice", "X");
assert.equal(spokenXForR.trial.isCorrect, false, "displayed R with recognized X must count as incorrect");

for (const transcript of ["letter r", "are"]) {
  const rightRSession = engine.createSession({ random: () => 0.6 });
  assert.equal(rightRSession.nextTrial().letter, "R");
  assert.equal(rightRSession.submit(engine.mapTranscriptToLetter(transcript), "voice", transcript).trial.isCorrect, true, transcript);
}

for (const transcript of ["f", "ef", "eff", "letter f", "the letter f"]) {
  const rightFSession = engine.createSession({ random: () => 0.1 });
  assert.equal(rightFSession.nextTrial().letter, "F");
  assert.equal(rightFSession.submit(engine.mapTranscriptToLetter(transcript), "voice", transcript).trial.isCorrect, true, transcript);
}

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "pages", "letter-vision-test.html"), "utf8");
const ui = fs.readFileSync(path.join(root, "js", "letter-vision-test.js"), "utf8");
const history = fs.readFileSync(path.join(root, "js", "history-storage.js"), "utf8");
const report = fs.readFileSync(path.join(root, "js", "report.js"), "utf8");
assert.match(html, /data-letter-start="voice"/);
assert.match(html, /data-letter-start="manual"/);
assert.equal((html.match(/data-letter-mode=/g) || []).length, 2, "letter test must expose exactly two input modes");
assert.doesNotMatch(html, /data-open-realtime/, "letter test must not expose camera mode");
assert.match(ui, /type: "letter-vision"/);
assert.match(ui, /FEEDBACK_DELAY_MS = 1200/);
assert.match(html, /انطق اسم الحرف بالإنجليزية، مثل F أو Eff/);
const setModeImplementation = ui.slice(ui.indexOf("function setMode(mode)"), ui.indexOf("function renderTrial()"));
assert.doesNotMatch(setModeImplementation, /createSession|session\s*=/, "switching voice and keyboard modes must not reset examination progress");
for (const hook of ["data-letter-right-accuracy", "data-letter-left-accuracy", "data-letter-right-levels", "data-letter-left-levels"]) assert.match(html, new RegExp(hook));
assert.match(ui, /summary\.accuracy/);
assert.match(history, /"letter-vision"/);
assert.match(report, /"letter-vision"/);

const storedValues = new Map();
let generatedIds = 0;
const storageContext = {
  window: {
    localStorage: {
      getItem: (key) => storedValues.get(key) || null,
      setItem: (key, value) => storedValues.set(key, value),
    },
    crypto: { randomUUID: () => `test-${generatedIds += 1}` },
  },
};
vm.createContext(storageContext);
vm.runInContext(history, storageContext);
assert.equal(storageContext.window.EyeCareHistory.addRecord({
  type: "vision", title: "Existing E", summary: "kept", resultData: {},
}).success, true);
assert.equal(storageContext.window.EyeCareHistory.addRecord({
  type: "letter-vision", title: "Letters", summary: "new", resultData: { rightEye: "12/12", leftEye: "11/12" },
}).success, true);
assert.equal(storageContext.window.EyeCareHistory.getHistory().length, 2, "letter history must not overwrite Tumbling E history");

const reportContext = {
  URL,
  console,
  document: { currentScript: { src: "https://example.test/js/report.js" } },
  window: { location: { href: "https://example.test/pages/letter-vision-test.html" } },
};
vm.createContext(reportContext);
vm.runInContext(report, reportContext);
const reportDefinition = reportContext.window.EyeCareReport.getReportDefinition({
  type: "letter-vision",
  title: "Letters",
  resultData: { rightEye: "12/12", rightAccuracy: 100, leftEye: "11/12", leftAccuracy: 92, questionCount: 24, correct: 23, incorrect: 1 },
});
assert.match(reportDefinition.title, /تمييز الحروف/);
assert.ok(reportDefinition.rows.some(([label]) => label === "نتيجة العين اليمنى"));
assert.ok(reportDefinition.rows.some(([label, value]) => label === "دقة العين اليمنى" && value === "100%"));

console.log("Letter mapping, randomization, progression, two-eye workflow, and integrations passed.");
