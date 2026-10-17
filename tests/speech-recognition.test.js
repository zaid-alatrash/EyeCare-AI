"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  RetryTracker,
  normalizeTranscript,
  mapTranscriptToDirection,
  createController,
} = require(path.join(__dirname, "..", "js", "speech-recognition.js"));
const letterEngine = require(path.join(__dirname, "..", "js", "letter-test-engine.js"));

assert.equal(normalizeTranscript("  لِلْأَعْلَى! "), "للاعلي");
assert.equal(normalizeTranscript("عَ الشِّمال"), "ع الشمال");

const directionCases = new Map([
  ["فوق", "up"], ["لفوق", "up"], ["أعلى", "up"], ["للأعلى", "up"], ["go up", "up"],
  ["تحت", "down"], ["لتحت", "down"], ["أسفل", "down"], ["للأسفل", "down"], ["down", "down"],
  ["يسار", "left"], ["لليسار", "left"], ["شمال", "left"], ["على الشمال", "left"], ["left", "left"],
  ["يمين", "right"], ["لليمين", "right"], ["عاليمين", "right"], ["على اليمين", "right"], ["right", "right"],
]);
directionCases.forEach((expected, phrase) => assert.equal(mapTranscriptToDirection(phrase), expected, phrase));
for (const phrase of ["للأعلى", "إلى الأعلى", "لجهة الأعلى", "جهة الأعلى", "ارفع لفوق"]) assert.equal(mapTranscriptToDirection(phrase), "up", phrase);
for (const phrase of ["للأسفل", "إلى الأسفل", "لجهة الأسفل", "جهة الأسفل"]) assert.equal(mapTranscriptToDirection(phrase), "down", phrase);
for (const phrase of ["اليسار", "إلى اليسار", "جهة اليسار", "للشمال"]) assert.equal(mapTranscriptToDirection(phrase), "left", phrase);
for (const phrase of ["اليمين", "إلى اليمين", "جهة اليمين"]) assert.equal(mapTranscriptToDirection(phrase), "right", phrase);
assert.equal(mapTranscriptToDirection("مش يمين"), null, "negated Arabic directions must be rejected");
assert.equal(mapTranscriptToDirection("not left"), null, "negated English directions must be rejected");
assert.equal(mapTranscriptToDirection("يميني"), null, "must not use unsafe substring matching");
assert.equal(mapTranscriptToDirection("يمين يسار"), null, "ambiguous directions must be rejected");
assert.equal(mapTranscriptToDirection("كلمة غير مرتبطة"), null);

const retries = new RetryTracker(3);
assert.deepEqual(retries.fail(), { attempts: 1, canRetry: true, offerManual: false });
assert.deepEqual(retries.fail(), { attempts: 2, canRetry: true, offerManual: false });
assert.deepEqual(retries.fail(), { attempts: 3, canRetry: false, offerManual: true });
retries.reset();
assert.equal(retries.attempts, 0);

class FakeRecognition {
  static instances = [];
  constructor() { this.phrases = []; FakeRecognition.instances.push(this); }
  start() { this.onstart?.(); }
  abort() { this.aborted = true; this.onend?.(); }
  emit(transcript) {
    const alternative = { transcript };
    const result = [alternative];
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  emitAlternatives(transcripts) {
    const result = transcripts.map((candidate) => (
      typeof candidate === "string" ? { transcript: candidate } : candidate
    ));
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  emitInterim(transcript) {
    const result = [{ transcript }];
    result.isFinal = false;
    this.onresult?.({ resultIndex: 0, results: [result] });
  }
  emitError(error) { this.onerror?.({ error }); }
  endNaturally() { this.onend?.(); }
}

const submitted = [];
let lastRecognitionState = null;
const controller = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  onDirection: (direction, transcript) => submitted.push({ direction, transcript }),
  onState: (nextState) => { lastRecognitionState = nextState; },
});
assert.equal(controller.start(true), true);
assert.equal(controller.start(true), true);
assert.equal(FakeRecognition.instances.length, 1, "parallel recognition sessions must be prevented");
FakeRecognition.instances[0].emitInterim("يسار");
assert.deepEqual(submitted, [], "interim transcripts must never submit answers");
FakeRecognition.instances[0].emit("يمين");
FakeRecognition.instances[0].emit("يسار");
FakeRecognition.instances[0].emitError("network");
assert.deepEqual(submitted, [{ direction: "right", transcript: "يمين" }], "one recognition session must submit at most one answer with its transcript");
assert.equal(lastRecognitionState.name, "recorded", "a delayed error must not overwrite a handled result");
controller.stop();

const alternativeSubmissions = [];
let alternativeState = null;
const alternativeMap = { see: "C", sea: "C", ess: "S", you: "U" };
const alternativeController = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  interpretTranscript: (transcript) => alternativeMap[transcript] || null,
  onAnswer: (answer, transcript) => alternativeSubmissions.push({ answer, transcript }),
  onState: (nextState) => { alternativeState = nextState; },
});
alternativeController.start(true);
FakeRecognition.instances.at(-1).emitAlternatives(["see", "sea"]);
assert.deepEqual(alternativeSubmissions, [{ answer: "C", transcript: "see" }], "equivalent alternatives must submit once");
alternativeController.continueAfterQuestion();
alternativeController.stop();

const letterPhraseSubmissions = [];
let letterPhraseState = null;
const letterPhraseController = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  interpretTranscript: letterEngine.mapTranscriptToLetter,
  onAnswer: (answer, transcript) => letterPhraseSubmissions.push({ answer, transcript }),
  onState: (nextState) => { letterPhraseState = nextState; },
});
letterPhraseController.start(true);
FakeRecognition.instances.at(-1).emitAlternatives(["the letter f", "letter eff"]);
assert.deepEqual(letterPhraseSubmissions, [{ answer: "F", transcript: "the letter f" }]);
assert.equal(letterPhraseState.answer, "F");
assert.equal(letterPhraseState.transcript, "the letter f");
letterPhraseController.stop();

const conflictingLetterSubmissions = [];
const conflictingLetterController = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  interpretTranscript: letterEngine.mapTranscriptToLetter,
  onAnswer: (answer) => conflictingLetterSubmissions.push(answer),
  onState: (nextState) => { letterPhraseState = nextState; },
});
conflictingLetterController.start(true);
FakeRecognition.instances.at(-1).emitAlternatives(["the letter f", "the letter c"]);
assert.deepEqual(conflictingLetterSubmissions, ["F"], "a clear primary letter must outrank an unscored lower alternative");
assert.equal(letterPhraseState.name, "recorded");
conflictingLetterController.stop();

const fallbackAlternativeSubmissions = [];
const fallbackAlternativeController = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  interpretTranscript: (transcript) => alternativeMap[transcript] || null,
  onAnswer: (answer, transcript) => fallbackAlternativeSubmissions.push({ answer, transcript }),
});
fallbackAlternativeController.start(true);
FakeRecognition.instances.at(-1).emitAlternatives(["unmapped primary", "you"]);
assert.deepEqual(
  fallbackAlternativeSubmissions,
  [{ answer: "U", transcript: "unmapped primary" }],
  "an interpreted alternative may answer, while the original primary transcript remains visible",
);
fallbackAlternativeController.stop();

const ambiguousSubmissions = [];
const ambiguousController = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  interpretTranscript: (transcript) => alternativeMap[transcript] || null,
  onAnswer: (answer) => ambiguousSubmissions.push(answer),
  onState: (nextState) => { alternativeState = nextState; },
});
ambiguousController.start(true);
FakeRecognition.instances.at(-1).emitAlternatives([
  { transcript: "see", confidence: 0.62 },
  { transcript: "ess", confidence: 0.59 },
]);
assert.deepEqual(ambiguousSubmissions, [], "similarly ranked, conflicting letters must remain unrecognized");
assert.equal(alternativeState.name, "unrecognized");
assert.equal(alternativeState.transcript, "see", "the actual primary transcript must remain visible");
ambiguousController.stop();

const weakConflictSubmissions = [];
const weakConflictController = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  minimumConfidence: 0.45,
  interpretTranscript: (transcript) => alternativeMap[transcript] || null,
  onAnswer: (answer) => weakConflictSubmissions.push(answer),
  onState: (nextState) => { alternativeState = nextState; },
});
weakConflictController.start(true);
FakeRecognition.instances.at(-1).emitAlternatives([
  { transcript: "see", confidence: 0.8 },
  { transcript: "ess", confidence: 0.31 },
]);
assert.deepEqual(weakConflictSubmissions, ["C"], "a weak lower-ranked conflict must not reject a clear primary letter");
weakConflictController.stop();

const primaryXSubmissions = [];
const primaryXController = createController({
  Recognition: FakeRecognition,
  browser: { setTimeout, clearTimeout },
  interpretTranscript: letterEngine.mapTranscriptToLetter,
  onAnswer: (answer, transcript) => primaryXSubmissions.push({ answer, transcript }),
});
primaryXController.start(true);
FakeRecognition.instances.at(-1).emitAlternatives(["X", "are"]);
assert.deepEqual(primaryXSubmissions, [{ answer: "X", transcript: "X" }], "a valid primary X must not become unrecognized because of lower-ranked R");
primaryXController.stop();

class FakeRecognitionPhrase {
  constructor(phrase, boost) { this.phrase = phrase; this.boost = boost; }
}
const phraseController = createController({
  Recognition: FakeRecognition,
  SpeechRecognitionPhrase: FakeRecognitionPhrase,
  contextualPhrases: ["you", "double you", "ex"],
  phraseBoost: 4,
  browser: { setTimeout, clearTimeout },
});
phraseController.start(true);
assert.deepEqual(
  FakeRecognition.instances.at(-1).phrases.map(({ phrase, boost }) => [phrase, boost]),
  [["you", 4], ["double you", 4], ["ex", 4]],
  "supported browsers should receive equal contextual hints that do not depend on the displayed answer",
);
phraseController.stop();

let standardState = null;
const standardController = createController({
  Recognition: FakeRecognition,
  contextualPhrases: ["you"],
  browser: { setTimeout, clearTimeout },
  onState: (nextState) => { standardState = nextState; },
});
standardController.start(true);
assert.equal(standardState.name, "listening", "basic Chrome-style recognition must work when SpeechRecognitionPhrase is missing");
standardController.stop();

class NoPhrasePropertyRecognition {
  static instances = [];
  constructor() { NoPhrasePropertyRecognition.instances.push(this); }
  start() { this.onstart?.(); }
  abort() { this.aborted = true; this.onend?.(); }
}
const unsupportedPropertyController = createController({
  Recognition: NoPhrasePropertyRecognition,
  SpeechRecognitionPhrase: FakeRecognitionPhrase,
  contextualPhrases: ["you"],
  browser: { setTimeout, clearTimeout },
  onState: (nextState) => { standardState = nextState; },
});
unsupportedPropertyController.start(true);
assert.equal(standardState.name, "listening", "a missing phrases property must not disable basic recognition");
unsupportedPropertyController.stop();

class ThrowingPhraseRecognition {
  constructor() {
    Object.defineProperty(this, "phrases", { set() { throw new Error("unsupported"); } });
  }
  start() { this.onstart?.(); }
  abort() { this.aborted = true; this.onend?.(); }
}
const throwingPhraseController = createController({
  Recognition: ThrowingPhraseRecognition,
  SpeechRecognitionPhrase: FakeRecognitionPhrase,
  contextualPhrases: ["you"],
  browser: { setTimeout, clearTimeout },
  debug: false,
  onState: (nextState) => { standardState = nextState; },
});
throwingPhraseController.start(true);
assert.equal(standardState.name, "listening", "a synchronous hint configuration error must fall back to basic recognition");
throwingPhraseController.stop();

const hintFallbackCallbacks = [];
const hintFallbackStates = [];
const hintFallbackController = createController({
  Recognition: FakeRecognition,
  SpeechRecognitionPhrase: FakeRecognitionPhrase,
  contextualPhrases: ["you", "ex"],
  browser: {
    clearTimeout() {},
    setTimeout: (callback) => { hintFallbackCallbacks.push(callback); return hintFallbackCallbacks.length; },
  },
  debug: false,
  onState: (nextState) => { hintFallbackStates.push(nextState); },
});
hintFallbackController.start(true);
const hintedSession = FakeRecognition.instances.at(-1);
assert.equal(hintedSession.phrases.length, 2);
hintedSession.emitError("phrases-not-supported");
assert.equal(hintFallbackCallbacks.length, 1, "an asynchronous hint error must schedule one fallback without hints");
assert.equal(hintFallbackStates.some((state) => state.errorCode === "phrases-not-supported"), false, "experimental hint errors must not be shown as fatal patient errors");
hintFallbackCallbacks[0]();
const basicFallbackSession = FakeRecognition.instances.at(-1);
assert.notEqual(basicFallbackSession, hintedSession);
assert.equal(basicFallbackSession.phrases.length, 0, "the fallback session must start without contextual hints");
assert.equal(hintFallbackStates.at(-1).name, "listening");
hintFallbackController.stop();

const initializationCallbacks = [];
let initializationState = null;
class FirstStartHangsRecognition {
  static instances = [];
  constructor() { FirstStartHangsRecognition.instances.push(this); }
  start() {
    if (FirstStartHangsRecognition.instances.length > 1) this.onstart?.();
  }
  abort() { this.aborted = true; this.onend?.(); }
}
const initializationController = createController({
  Recognition: FirstStartHangsRecognition,
  initializationTimeoutMs: 25,
  browser: {
    clearTimeout() {},
    setTimeout: (callback) => { initializationCallbacks.push(callback); return initializationCallbacks.length; },
  },
  debug: false,
  onState: (nextState) => { initializationState = nextState; },
});
initializationController.start(true);
assert.equal(initializationState.name, "processing");
assert.equal(initializationCallbacks.length, 1);
initializationCallbacks[0]();
assert.equal(initializationState.name, "error");
assert.equal(initializationState.errorCode, "initialization-timeout");
assert.equal(initializationController.isListening(), false);
assert.equal(initializationController.start(true), true, "the retry button path must start a clean session after timeout");
assert.equal(initializationState.name, "listening");
const retriedSession = FirstStartHangsRecognition.instances.at(-1);
initializationController.stop();
assert.equal(retriedSession.aborted, true, "switching away from voice mode must abort the active session");
assert.equal(initializationController.isActive(), false);

let unrecognizedState = null;
let spokenRetry = null;
let synthesisFinished = null;
let unrecognizedSubmissions = 0;
const scheduledRestarts = [];
class FakeUtterance {
  constructor(text) { this.text = text; }
}
const unrecognizedController = createController({
  Recognition: FakeRecognition,
  SpeechSynthesisUtterance: FakeUtterance,
  speechSynthesis: {
    cancel() {},
    getVoices: () => [{ lang: "ar-SA" }],
    speak: (utterance) => { spokenRetry = utterance.text; synthesisFinished = utterance.onend; },
  },
  browser: {
    clearTimeout() {},
    setTimeout: (callback) => { scheduledRestarts.push(callback); return scheduledRestarts.length; },
  },
  onState: (nextState) => { unrecognizedState = nextState; },
  onDirection: () => { unrecognizedSubmissions += 1; },
});
unrecognizedController.start(true);
const unrecognizedSession = FakeRecognition.instances.at(-1);
unrecognizedSession.emit("كلمة غير مرتبطة");
assert.equal(unrecognizedSession.aborted, true, "recognition must stop before speech synthesis starts");
assert.equal(unrecognizedState.name, "unrecognized");
assert.equal(unrecognizedState.transcript, "كلمة غير مرتبطة");
assert.equal(unrecognizedSubmissions, 0, "unrecognized speech must not submit or affect scoring");
assert.equal(spokenRetry, "أعد الكلام من فضلك");
assert.equal(scheduledRestarts.length, 0, "recognition must wait for speech synthesis to finish");
synthesisFinished();
assert.equal(scheduledRestarts.length, 1, "recognition may restart only after speech synthesis finishes");

let noSpeechState = null;
const noSpeechController = createController({
  Recognition: FakeRecognition,
  browser: { clearTimeout() {}, setTimeout: () => 1 },
  onState: (nextState) => { noSpeechState = nextState; },
});
noSpeechController.start(true);
FakeRecognition.instances.at(-1).emitError("no-speech");
assert.equal(noSpeechState.name, "silence");
assert.equal(noSpeechState.message, "لم يتم سماع إجابة، ما زلت أستمع...");
assert.equal(noSpeechState.transcript, undefined, "no-speech must not invent a transcript");

const naturalRestartCallbacks = [];
let naturalEndState = null;
const naturalEndController = createController({
  Recognition: FakeRecognition,
  browser: {
    clearTimeout() {},
    setTimeout: (callback) => { naturalRestartCallbacks.push(callback); return naturalRestartCallbacks.length; },
  },
  onState: (nextState) => { naturalEndState = nextState; },
});
naturalEndController.start(true);
FakeRecognition.instances.at(-1).endNaturally();
assert.equal(naturalEndState.name, "silence");
assert.equal(naturalEndState.active, true, "natural termination must keep voice mode active");
assert.equal(naturalRestartCallbacks.length, 1, "natural termination must schedule one controlled restart");
naturalRestartCallbacks[0]();
assert.equal(naturalEndController.isListening(), true, "the controlled restart must open a new recognition session");
naturalEndController.stop();

let unsupportedState = null;
let fallbackOffers = 0;
const unsupported = createController({
  browser: {},
  onState: (state) => { unsupportedState = state; },
  onOfferManual: () => { fallbackOffers += 1; },
});
assert.equal(unsupported.start(true), false);
assert.equal(unsupportedState.name, "unsupported");
assert.equal(fallbackOffers, 1);

const technicalErrors = new Map([
  ["not-allowed", "تم رفض إذن الميكروفون"],
  ["audio-capture", "لم يتم العثور على ميكروفون"],
  ["network", "تعذر الاتصال بخدمة التعرف الصوتي"],
  ["service-not-allowed", "خدمة التعرف الصوتي محظورة"],
  ["language-not-supported", "لغة التعرف المختارة غير مدعومة"],
  ["insecure-context", "يتطلب التعرف الصوتي سياقًا آمنًا"],
  ["unknown-error", "حدث خطأ في التعرف الصوتي"],
]);
technicalErrors.forEach((expectedMessage, errorCode) => {
  let errorState = null;
  let offeredManual = false;
  const errorController = createController({
    Recognition: FakeRecognition,
    browser: { setTimeout, clearTimeout },
    debug: false,
    onState: (nextState) => { errorState = nextState; },
    onOfferManual: () => { offeredManual = true; },
  });
  errorController.start(true);
  FakeRecognition.instances.at(-1).emitError(errorCode);
  assert.equal(errorState.name, "error", `${errorCode} must expose an error state`);
  assert.equal(errorState.errorCode, errorCode);
  assert.match(errorState.message, new RegExp(expectedMessage));
  assert.equal(offeredManual, true, `${errorCode} must keep manual answering available`);
});

const diagnostics = [];
const diagnosticController = createController({
  Recognition: FakeRecognition,
  browser: {
    setTimeout,
    clearTimeout,
    location: { hostname: "localhost", protocol: "http:" },
    console: { warn: (...parts) => diagnostics.push(parts) },
  },
});
diagnosticController.start(true);
FakeRecognition.instances.at(-1).emitError("network");
assert.equal(diagnostics.length, 1, "development diagnostics must include the browser error code");
assert.equal(diagnostics[0].at(-1), "network");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "pages", "vision-test.html"), "utf8");
const integration = fs.readFileSync(path.join(root, "js", "vision-test.js"), "utf8");
for (const hook of ["data-open-realtime", "data-action=\"start-voice\"", "data-action=\"start\""]) {
  assert.match(html, new RegExp(hook), `missing answering mode: ${hook}`);
}
assert.equal((html.match(/data-vision-mode=/g) || []).length, 3, "exactly three compact mode buttons are required");
assert.match(html, /data-vision-mode-selector hidden/, "the in-examination switcher must stay hidden on the introduction");
assert.match(html, /data-step="type-selection"/);
assert.match(html, /اختبار اتجاه حرف E/);
assert.match(html, /href="letter-vision-test\.html"/);
assert.match(html, /العودة للخدمات[\s\S]*?اختبار فوري بالكاميرا[\s\S]*?ابدأ بالصوت[\s\S]*?ابدأ يدويًا/, "the original introduction actions must contain all start methods");
assert.doesNotMatch(html, /answer-mode-card/, "large mode cards must not return");
assert.match(html, /speech-recognition\.js/);
assert.match(integration, /submitAnswer\(direction, "voice", transcript\)/);
assert.match(integration, /VOICE_FEEDBACK_DELAY_MS = 1200/);
for (const hook of ["data-voice-transcript", "data-voice-direction", "data-voice-result"]) assert.match(html, new RegExp(hook));
assert.match(integration, /inputMethod/);
assert.match(integration, /eyecare:close-realtime/);
assert.match(integration, /state\.currentStep === "intro"/, "mode switching must not restart an active test");

console.log("Speech mapping, error states, mode selector, retry policy, and duplicate-answer guard passed.");
