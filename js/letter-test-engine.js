(() => {
  "use strict";

  const DISPLAY_LETTERS = Object.freeze(["A", "F", "H", "K", "L", "O", "R", "U", "V", "X"]);
  const ANSWER_LETTERS = Object.freeze("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split(""));
  const DIFFICULTY_LEVELS = Object.freeze([
    Object.freeze({ id: "large", label: "كبير", fontSize: 132 }),
    Object.freeze({ id: "medium", label: "متوسط", fontSize: 98 }),
    Object.freeze({ id: "small", label: "صغير", fontSize: 72 }),
    Object.freeze({ id: "very-small", label: "صغير جدًا", fontSize: 52 }),
  ]);
  const TRIALS_PER_LEVEL = 3;

  const LETTER_ALIASES = Object.freeze({
    A: ["a", "ay", "aye", "اي", "إيه"],
    B: ["b", "bee", "be"],
    C: ["c", "see", "sea"],
    D: ["d", "dee"],
    E: ["e", "ee"],
    F: ["f", "ef", "eff", "اف", "إف"],
    G: ["g", "gee"],
    H: ["h", "aitch", "haitch", "اتش", "إتش"],
    I: ["i", "eye"],
    J: ["j", "jay"],
    K: ["k", "kay", "كي", "كاي"],
    L: ["l", "el", "ell", "ال", "إل"],
    M: ["m", "em"],
    N: ["n", "en"],
    O: ["o", "oh", "او", "أو"],
    P: ["p", "pee", "pea"],
    Q: ["q", "cue", "queue"],
    R: ["r", "ar", "are", "ار", "آر"],
    S: ["s", "ess"],
    T: ["t", "tee", "tea"],
    U: ["u", "you", "ewe", "يو"],
    V: ["v", "vee", "في", "ڤي"],
    W: ["w", "double u", "double you", "double-u"],
    X: ["x", "ex", "اكس", "إكس"],
    Y: ["y", "why"],
    Z: ["z", "zee", "zed"],
  });

  const SPEECH_PHRASES = Object.freeze([
    "ay", "bee", "see", "dee", "ee", "ef", "eff", "gee", "aitch", "eye", "jay", "kay", "el", "em",
    "en", "oh", "pee", "cue", "are", "ess", "tee", "you", "vee", "double you", "ex", "why", "zee", "zed",
  ]);

  function normalize(value) {
    const shared = typeof window !== "undefined" ? window.EyeCareSpeechRecognition?.normalizeTranscript : null;
    if (shared) return shared(value);
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

  function normalizeLetterTranscript(value) {
    return normalize(String(value || "").replace(/[’']/g, ""));
  }

  const LETTERS_BY_ALIAS = new Map();
  Object.entries(LETTER_ALIASES).forEach(([letter, aliases]) => {
    aliases.forEach((alias) => {
      const normalizedAlias = normalizeLetterTranscript(alias);
      if (!LETTERS_BY_ALIAS.has(normalizedAlias)) LETTERS_BY_ALIAS.set(normalizedAlias, new Set());
      LETTERS_BY_ALIAS.get(normalizedAlias).add(letter);
    });
  });

  const ANSWER_PREFIXES = Object.freeze(["the letter ", "letter ", "it is ", "its "]);

  function mapTranscriptToLetter(transcript) {
    const normalized = normalizeLetterTranscript(transcript);
    if (!normalized) return null;
    const prefixed = ANSWER_PREFIXES.find((prefix) => normalized.startsWith(prefix));
    const answerText = prefixed ? normalized.slice(prefixed.length).trim() : normalized;
    if (!answerText) return null;
    const matches = LETTERS_BY_ALIAS.get(answerText);
    return matches?.size === 1 ? [...matches][0] : null;
  }

  function normalizeManualLetter(value) {
    const normalized = String(value || "").trim().toUpperCase();
    return /^[A-Z]$/.test(normalized) ? normalized : null;
  }

  function createLetterSequence(length, random = Math.random) {
    const sequence = [];
    while (sequence.length < length) {
      const previous = sequence.at(-1);
      const choices = DISPLAY_LETTERS.filter((letter) => letter !== previous);
      sequence.push(choices[Math.floor(random() * choices.length)]);
    }
    return sequence;
  }

  function summarizeEye(trials, eye) {
    const eyeTrials = trials.filter((trial) => trial.eye === eye);
    const levels = DIFFICULTY_LEVELS.map((level, index) => {
      const levelTrials = eyeTrials.filter((trial) => trial.levelIndex === index);
      return {
        id: level.id,
        label: level.label,
        total: levelTrials.length,
        correct: levelTrials.filter((trial) => trial.isCorrect).length,
      };
    });
    const correct = eyeTrials.filter((trial) => trial.isCorrect).length;
    const hardestPassed = [...levels].reverse().find((level) => level.total && level.correct >= 2);
    return {
      eye,
      total: eyeTrials.length,
      correct,
      incorrect: eyeTrials.length - correct,
      accuracy: eyeTrials.length ? Math.round((correct / eyeTrials.length) * 100) : 0,
      levels,
      highestCompletedLevel: hardestPassed?.label || "لم يكتمل أي مستوى",
      approximateResult: hardestPassed
        ? `أكمل مستوى الحروف ${hardestPassed.label} بنجاح إرشادي`
        : "لم يكتمل مستوى الحروف الكبيرة بالحد الإرشادي",
    };
  }

  function createSession({ random = Math.random } = {}) {
    const totalPerEye = DIFFICULTY_LEVELS.length * TRIALS_PER_LEVEL;
    const sequence = createLetterSequence(totalPerEye * 2, random);
    const state = {
      eye: "right",
      levelIndex: 0,
      trialInLevel: 0,
      sequenceIndex: 0,
      currentTrial: null,
      trials: [],
      complete: false,
    };

    function nextTrial() {
      if (state.complete) return null;
      if (state.currentTrial) return { ...state.currentTrial };
      const level = DIFFICULTY_LEVELS[state.levelIndex];
      state.currentTrial = {
        eye: state.eye,
        letter: sequence[state.sequenceIndex],
        levelIndex: state.levelIndex,
        level: level.label,
        fontSize: level.fontSize,
        trialInLevel: state.trialInLevel,
      };
      return { ...state.currentTrial };
    }

    function submit(answer, inputMethod, transcript = "") {
      if (!state.currentTrial) return null;
      const trial = {
        ...state.currentTrial,
        questionNumber: state.trials.length + 1,
        userAnswer: answer,
        inputMethod,
        transcript,
        isCorrect: answer === state.currentTrial.letter,
      };
      state.trials.push(trial);
      state.currentTrial = null;
      state.sequenceIndex += 1;
      state.trialInLevel += 1;

      if (state.trialInLevel >= TRIALS_PER_LEVEL) {
        state.trialInLevel = 0;
        state.levelIndex += 1;
      }

      if (state.levelIndex >= DIFFICULTY_LEVELS.length) {
        if (state.eye === "right") return { status: "eye-complete", trial, summary: summarizeEye(state.trials, "right") };
        state.complete = true;
        return { status: "complete", trial, summary: summarizeEye(state.trials, "left") };
      }
      return { status: "next", trial };
    }

    function startLeftEye() {
      if (state.eye !== "right" || state.levelIndex < DIFFICULTY_LEVELS.length) return false;
      state.eye = "left";
      state.levelIndex = 0;
      state.trialInLevel = 0;
      state.currentTrial = null;
      return true;
    }

    function snapshot() {
      return {
        eye: state.eye,
        levelIndex: state.levelIndex,
        trialInLevel: state.trialInLevel,
        sequence: [...sequence],
        sequenceIndex: state.sequenceIndex,
        trials: state.trials.map((trial) => ({ ...trial })),
        complete: state.complete,
      };
    }

    return Object.freeze({ nextTrial, submit, startLeftEye, snapshot, summarizeEye: (eye) => summarizeEye(state.trials, eye) });
  }

  const api = Object.freeze({
    DISPLAY_LETTERS,
    ANSWER_LETTERS,
    SUPPORTED_LETTERS: DISPLAY_LETTERS,
    LETTER_ALIASES,
    SPEECH_PHRASES,
    DIFFICULTY_LEVELS,
    TRIALS_PER_LEVEL,
    mapTranscriptToLetter,
    normalizeLetterTranscript,
    normalizeManualLetter,
    createLetterSequence,
    summarizeEye,
    createSession,
  });
  if (typeof window !== "undefined") window.EyeCareLetterTest = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
