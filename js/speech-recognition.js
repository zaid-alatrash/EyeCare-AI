(() => {
  "use strict";

  const DIRECTION_ALIASES = Object.freeze({
    up: ["أعلى", "الأعلى", "للأعلى", "لل أعلى", "إلى الأعلى", "لجهة الأعلى", "جهة الأعلى", "فوق", "لفوق", "ل فوق", "إلى فوق", "ارفع لفوق", "up", "to up", "turn up"],
    down: ["أسفل", "الأسفل", "للأسفل", "لل أسفل", "إلى الأسفل", "لجهة الأسفل", "جهة الأسفل", "تحت", "لتحت", "ل تحت", "down", "to down", "turn down"],
    left: ["يسار", "اليسار", "لليسار", "لل يسار", "إلى اليسار", "جهة اليسار", "شمال", "عالشمال", "ع الشمال", "على الشمال", "للشمال", "left", "to left", "turn left"],
    right: ["يمين", "اليمين", "لليمين", "لل يمين", "إلى اليمين", "جهة اليمين", "عاليمين", "ع اليمين", "على اليمين", "right", "to right", "turn right"],
  });

  const NEGATION_TOKENS = new Set(["مش", "مو", "ليس", "لا", "not", "no", "dont"]);

  function normalizeTranscript(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/ـ/g, "")
      .replace(/[إأآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[^a-z\u0621-\u063A\u0641-\u064A\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const normalizedAliases = Object.freeze(Object.fromEntries(
    Object.entries(DIRECTION_ALIASES).map(([direction, aliases]) => [
      direction,
      new Set(aliases.map(normalizeTranscript)),
    ]),
  ));

  function transcriptCandidates(transcript) {
    const normalized = normalizeTranscript(transcript);
    if (!normalized) return [];
    const words = normalized.split(" ");
    const candidates = new Set([normalized, ...words]);
    for (let index = 0; index < words.length - 1; index += 1) {
      candidates.add(`${words[index]} ${words[index + 1]}`);
    }
    return [...candidates];
  }

  function mapTranscriptToDirection(transcript) {
    const normalized = normalizeTranscript(transcript);
    if (normalized.split(" ").some((word) => NEGATION_TOKENS.has(word))) return null;
    const matches = [];
    const candidates = transcriptCandidates(normalized);
    Object.entries(normalizedAliases).forEach(([direction, aliases]) => {
      if (candidates.some((candidate) => aliases.has(candidate))) matches.push(direction);
    });
    return matches.length === 1 ? matches[0] : null;
  }

  class RetryTracker {
    constructor(maxAttempts = 3) {
      this.maxAttempts = maxAttempts;
      this.attempts = 0;
    }

    fail() {
      this.attempts += 1;
      return {
        attempts: this.attempts,
        canRetry: this.attempts < this.maxAttempts,
        offerManual: this.attempts >= this.maxAttempts,
      };
    }

    reset() { this.attempts = 0; }
  }

  function selectRecognitionAlternative(alternatives, interpretTranscript, minimumConfidence = 0) {
    const interpreted = alternatives.map((alternative, rank) => ({
      transcript: alternative.transcript,
      confidence: Number.isFinite(alternative.confidence) ? alternative.confidence : null,
      rank,
      answer: interpretTranscript(alternative.transcript),
    }));
    const primary = interpreted[0];
    const hasConfidence = (candidate) => candidate?.confidence !== null && candidate.confidence > 0;

    if (primary?.answer) {
      const strongConflict = interpreted.slice(1).some((candidate) => (
        candidate.answer
        && candidate.answer !== primary.answer
        && hasConfidence(primary)
        && hasConfidence(candidate)
        && candidate.confidence >= primary.confidence - 0.08
      ));
      return strongConflict ? null : primary;
    }

    const fallbackCandidates = interpreted.slice(1).filter((candidate) => (
      candidate.answer
      && (!hasConfidence(candidate) || candidate.confidence >= minimumConfidence)
    ));
    if (!fallbackCandidates.length) return null;

    const distinctAnswers = new Set(fallbackCandidates.map((candidate) => candidate.answer));
    if (distinctAnswers.size === 1) return fallbackCandidates[0];

    const top = fallbackCandidates[0];
    const strongestConflict = fallbackCandidates
      .slice(1)
      .filter((candidate) => candidate.answer !== top.answer && hasConfidence(candidate))
      .sort((first, second) => second.confidence - first.confidence)[0];
    if (hasConfidence(top) && strongestConflict && top.confidence - strongestConflict.confidence >= 0.15) return top;
    return null;
  }

  function createController(options = {}) {
    const browser = options.browser || (typeof window !== "undefined" ? window : {});
    const Recognition = options.Recognition || browser.SpeechRecognition || browser.webkitSpeechRecognition;
    const RecognitionPhrase = options.SpeechRecognitionPhrase || browser.SpeechRecognitionPhrase;
    const synthesis = options.speechSynthesis || browser.speechSynthesis;
    const Utterance = options.SpeechSynthesisUtterance || browser.SpeechSynthesisUtterance;
    const retryTracker = new RetryTracker(options.maxAttempts || 3);
    const notify = options.onState || (() => {});
    const interpretTranscript = options.interpretTranscript || mapTranscriptToDirection;
    const submitAnswer = options.onAnswer || options.onDirection || (() => {});
    const offerManual = options.onOfferManual || (() => {});
    const contextualPhrases = Array.isArray(options.contextualPhrases)
      ? [...new Set(options.contextualPhrases.map((phrase) => String(phrase || "").trim()).filter(Boolean))]
      : [];
    const phraseBoost = Math.min(10, Math.max(0, Number(options.phraseBoost) || 4));
    const minimumConfidence = Math.min(1, Math.max(0, Number(options.minimumConfidence) || 0));
    const initializationTimeoutMs = options.initializationTimeoutMs === 0
      ? 0
      : Math.max(1, Number(options.initializationTimeoutMs) || 6000);
    const isDevelopment = options.debug === true || (
      options.debug !== false
      && (
        ["localhost", "127.0.0.1"].includes(browser.location?.hostname)
        || browser.location?.protocol === "file:"
      )
    );
    let recognition = null;
    let language = options.language || "ar-SA";
    let listening = false;
    let starting = false;
    let authorized = false;
    let destroyed = false;
    let restartTimer = 0;
    let initializationTimer = 0;
    let pendingRestartDelay = null;
    let generation = 0;
    let resultHandled = false;
    let sessionEnded = true;
    let naturalEndCount = 0;
    let hintsDisabled = false;
    let hintFallbackUsed = false;
    let currentSessionUsedHints = false;

    function clearRestart() {
      browser.clearTimeout?.(restartTimer);
      restartTimer = 0;
    }

    function clearInitializationTimeout() {
      browser.clearTimeout?.(initializationTimer);
      initializationTimer = 0;
    }

    function setState(name, message, errorCode = null, details = {}) {
      notify({ name, message, errorCode, listening, active: authorized, attempts: retryTracker.attempts, ...details });
    }

    function logRecognitionError(errorCode) {
      if (isDevelopment) browser.console?.warn?.("[EyeCare Speech] Recognition error:", errorCode);
    }

    function logDiagnostic(message, details) {
      if (!isDevelopment) return;
      if (details === undefined) browser.console?.info?.(`[EyeCare Speech] ${message}`);
      else browser.console?.info?.(`[EyeCare Speech] ${message}`, details);
    }

    function stopRecognition() {
      clearInitializationTimeout();
      if (!recognition) return;
      try { recognition.abort(); } catch (error) { /* Session is already closed. */ }
      listening = false;
      starting = false;
    }

    function suitableArabicVoice() {
      if (!synthesis?.getVoices) return null;
      return synthesis.getVoices().find((voice) => /^ar(?:-|$)/i.test(voice.lang)) || null;
    }

    function scheduleRestart(delay = 350) {
      clearRestart();
      if (!authorized || destroyed) return;
      logDiagnostic("جدولة إعادة محاولة التعرف", { delay });
      restartTimer = browser.setTimeout?.(() => {
        restartTimer = 0;
        if (authorized && !destroyed) start(false);
      }, delay) || 0;
    }

    function queueRestart(delay = 350) {
      if (!authorized || destroyed) return;
      pendingRestartDelay = delay;
      if (!sessionEnded) return;
      const queuedDelay = pendingRestartDelay;
      pendingRestartDelay = null;
      scheduleRestart(queuedDelay);
    }

    function speakRetry(shouldRestart) {
      const message = "أعد الكلام من فضلك";
      synthesis?.cancel?.();
      const voice = suitableArabicVoice();
      if (!voice || !Utterance) {
        if (shouldRestart) queueRestart();
        return;
      }
      const utterance = new Utterance(message);
      utterance.lang = voice.lang || "ar-SA";
      utterance.voice = voice;
      utterance.onend = () => { if (shouldRestart) queueRestart(150); };
      utterance.onerror = () => { if (shouldRestart) queueRestart(150); };
      synthesis.speak(utterance);
    }

    function handleUnrecognized(transcript = "") {
      stopRecognition();
      const retry = retryTracker.fail();
      if (retry.offerManual) {
        authorized = false;
        offerManual();
      }
      setState("unrecognized", "لم يتم التعرف على الإجابة", null, { transcript });
      speakRetry(retry.canRetry);
    }

    function handleTechnicalError(errorName) {
      authorized = false;
      pendingRestartDelay = null;
      clearRestart();
      clearInitializationTimeout();
      generation += 1;
      stopRecognition();
      recognition = null;
      sessionEnded = true;
      logRecognitionError(errorName);
      const messages = {
        "not-allowed": "تم رفض إذن الميكروفون. اسمح به من إعدادات الموقع ثم أعد المحاولة.",
        "service-not-allowed": "خدمة التعرف الصوتي محظورة في هذا المتصفح أو السياق.",
        "audio-capture": "لم يتم العثور على ميكروفون متاح. تحقق من الجهاز والإذن.",
        network: "تعذر الاتصال بخدمة التعرف الصوتي. قد تمنعها الشبكة أو إعدادات خصوصية المتصفح؛ تحقق من الاتصال أو جرّب متصفحًا آخر.",
        "language-not-supported": "لغة التعرف المختارة غير مدعومة في هذا المتصفح. غيّر اللغة أو استخدم الوضع اليدوي.",
        "bad-grammar": "تعذر إعداد قواعد التعرف الصوتي في هذا المتصفح.",
        "initialization-timeout": "لم يبدأ الميكروفون في الوقت المتوقع. اضغط إعادة المحاولة أو استخدم لوحة المفاتيح.",
        "insecure-context": "يتطلب التعرف الصوتي سياقًا آمنًا. افتح الصفحة عبر HTTPS أو localhost ثم أعد المحاولة.",
        "start-failed": "تعذر بدء التعرف الصوتي. أغلق أي جلسة ميكروفون أخرى ثم أعد المحاولة.",
      };
      setState("error", messages[errorName] || "حدث خطأ في التعرف الصوتي. أعد المحاولة أو استخدم الوضع اليدوي.", errorName);
      offerManual();
    }

    function handleSilence() {
      stopRecognition();
      naturalEndCount += 1;
      const delay = Math.min(450 * (2 ** Math.min(naturalEndCount - 1, 3)), 3000);
      setState("silence", "لم يتم سماع إجابة، ما زلت أستمع...");
      queueRestart(delay);
    }

    function applyContextualPhrases(instance) {
      if (hintsDisabled || !contextualPhrases.length || !RecognitionPhrase || !("phrases" in instance)) {
        logDiagnostic("تلميحات الحروف الاختيارية غير مفعلة");
        return false;
      }
      try {
        instance.phrases = contextualPhrases.map((phrase) => new RecognitionPhrase(phrase, phraseBoost));
        logDiagnostic("تم تفعيل تلميحات الحروف الاختيارية");
        return true;
      } catch (error) {
        // Contextual biasing is experimental; basic recognition must continue.
        hintsDisabled = true;
        try { instance.phrases = []; } catch (cleanupError) { /* Unsupported setter; ignore it. */ }
        logRecognitionError("phrase-bias-unavailable");
        logDiagnostic("تعذر إعداد التلميحات؛ سيستمر التعرف الأساسي بدونها");
        return false;
      }
    }

    function fallbackWithoutHints(errorName) {
      if (hintFallbackUsed || hintsDisabled || !authorized || destroyed) return false;
      hintFallbackUsed = true;
      hintsDisabled = true;
      currentSessionUsedHints = false;
      pendingRestartDelay = null;
      clearRestart();
      clearInitializationTimeout();
      generation += 1;
      stopRecognition();
      recognition = null;
      sessionEnded = true;
      logRecognitionError(errorName);
      logDiagnostic("إعادة تشغيل التعرف الأساسي بدون تلميحات");
      setState("processing", "جاري تشغيل التعرف الصوتي الأساسي...");
      scheduleRestart(150);
      return true;
    }

    function armInitializationTimeout(instanceGeneration) {
      clearInitializationTimeout();
      if (!initializationTimeoutMs || !browser.setTimeout) return;
      initializationTimer = browser.setTimeout(() => {
        initializationTimer = 0;
        if (instanceGeneration !== generation || !starting || destroyed) return;
        logDiagnostic("انتهت مهلة تهيئة الميكروفون");
        handleTechnicalError("initialization-timeout");
      }, initializationTimeoutMs) || 0;
    }

    function buildRecognition() {
      logDiagnostic("تهيئة جلسة التعرف الصوتي");
      const instance = new Recognition();
      instance.lang = language;
      // One final utterance per session is more consistent across Chromium browsers;
      // controlled restarts provide continuous exam mode without duplicate finals.
      instance.continuous = false;
      instance.interimResults = false;
      instance.maxAlternatives = 3;
      const hintsApplied = applyContextualPhrases(instance);
      currentSessionUsedHints = hintsApplied;
      const instanceGeneration = generation;
      instance.onstart = () => {
        if (instanceGeneration !== generation) return;
        clearInitializationTimeout();
        starting = false;
        listening = true;
        resultHandled = false;
        sessionEnded = false;
        logDiagnostic("بدأت جلسة التعرف الصوتي", { hintsEnabled: hintsApplied });
        setState("listening", "جاري الاستماع...");
      };
      instance.onspeechstart = () => { naturalEndCount = 0; };
      instance.onspeechend = () => {
        if (instanceGeneration !== generation || resultHandled) return;
        setState("processing", "جاري تحليل الإجابة...");
      };
      instance.onresult = (event) => {
        if (instanceGeneration !== generation || resultHandled) return;
        const alternatives = [];
        for (let resultIndex = event.resultIndex || 0; resultIndex < event.results.length; resultIndex += 1) {
          if (event.results[resultIndex].isFinal === false) continue;
          for (let alternativeIndex = 0; alternativeIndex < event.results[resultIndex].length; alternativeIndex += 1) {
            const alternative = event.results[resultIndex][alternativeIndex];
            alternatives.push({
              transcript: alternative.transcript,
              confidence: Number.isFinite(alternative.confidence) ? alternative.confidence : null,
            });
          }
        }
        if (!alternatives.length) return;
        resultHandled = true;
        const interpreted = selectRecognitionAlternative(alternatives, interpretTranscript, minimumConfidence);
        const primaryTranscript = alternatives[0]?.transcript || "";
        if (!interpreted) {
          handleUnrecognized(primaryTranscript);
          return;
        }
        listening = false;
        naturalEndCount = 0;
        retryTracker.reset();
        setState("recorded", "تم التعرف على الإجابة", null, {
          transcript: primaryTranscript,
          selectedTranscript: interpreted.transcript,
          answer: interpreted.answer,
          direction: interpreted.answer,
        });
        try { instance.stop?.(); } catch (error) { /* Result already closed the session. */ }
        submitAnswer(interpreted.answer, primaryTranscript);
      };
      instance.onnomatch = () => {
        if (instanceGeneration !== generation || resultHandled) return;
        resultHandled = true;
        handleUnrecognized();
      };
      instance.onerror = (event) => {
        if (instanceGeneration !== generation || resultHandled || event.error === "aborted") return;
        clearInitializationTimeout();
        resultHandled = true;
        if (event.error === "phrases-not-supported" && hintsApplied && fallbackWithoutHints(event.error)) return;
        if (event.error === "no-speech") {
          logRecognitionError(event.error);
          handleSilence();
        }
        else handleTechnicalError(event.error === "phrases-not-supported" ? "start-failed" : event.error);
      };
      instance.onend = () => {
        if (instanceGeneration !== generation) return;
        clearInitializationTimeout();
        logDiagnostic("انتهت جلسة التعرف الصوتي");
        starting = false;
        listening = false;
        sessionEnded = true;
        recognition = null;
        if (pendingRestartDelay !== null) {
          queueRestart(pendingRestartDelay);
        } else if (authorized && !resultHandled) {
          naturalEndCount += 1;
          const delay = Math.min(450 * (2 ** Math.min(naturalEndCount - 1, 3)), 3000);
          setState("silence", "لم يتم سماع إجابة، ما زلت أستمع...");
          queueRestart(delay);
        }
      };
      return instance;
    }

    function start(userInitiated = true) {
      if (destroyed) return false;
      if (!userInitiated && !authorized) return false;
      if (!Recognition) {
        setState("unsupported", "المتصفح لا يدعم التعرف الصوتي");
        offerManual();
        return false;
      }
      if (browser.isSecureContext === false) {
        handleTechnicalError("insecure-context");
        return false;
      }
      if (listening || starting) return true;
      clearRestart();
      clearInitializationTimeout();
      synthesis?.cancel?.();
      if (userInitiated) authorized = true;
      generation += 1;
      currentSessionUsedHints = false;
      starting = true;
      sessionEnded = false;
      setState("processing", "جاري تجهيز الميكروفون...");
      try {
        recognition = buildRecognition();
        recognition.start();
        logDiagnostic("تم إرسال طلب بدء التعرف");
        if (starting) armInitializationTimeout(generation);
        return true;
      } catch (error) {
        if (currentSessionUsedHints && fallbackWithoutHints(error?.name || "start-failed")) return true;
        handleTechnicalError(error?.name || "start-failed");
        return false;
      }
    }

    function stop({ resetAuthorization = true, message = "تم إيقاف الاستماع" } = {}) {
      clearRestart();
      clearInitializationTimeout();
      pendingRestartDelay = null;
      generation += 1;
      stopRecognition();
      recognition = null;
      sessionEnded = true;
      synthesis?.cancel?.();
      if (resetAuthorization) authorized = false;
      setState("idle", message);
    }

    function continueAfterQuestion() {
      if (!authorized || destroyed) return;
      queueRestart(250);
    }

    function setLanguage(nextLanguage) {
      language = nextLanguage === "en-US" ? "en-US" : "ar-SA";
      retryTracker.reset();
      stop({ resetAuthorization: true });
    }

    function destroy() {
      destroyed = true;
      stop();
      recognition = null;
    }

    return Object.freeze({
      supported: Boolean(Recognition),
      start,
      stop,
      destroy,
      setLanguage,
      continueAfterQuestion,
      isListening: () => listening || starting,
      isActive: () => authorized,
      isAuthorized: () => authorized,
    });
  }

  const api = Object.freeze({
    DIRECTION_ALIASES,
    RetryTracker,
    normalizeTranscript,
    mapTranscriptToDirection,
    selectRecognitionAlternative,
    createController,
  });
  if (typeof window !== "undefined") window.EyeCareSpeechRecognition = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
