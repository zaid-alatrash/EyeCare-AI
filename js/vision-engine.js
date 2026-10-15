(() => {
  "use strict";

  const CARD_WIDTH_MM = 85.6;
  const CARD_HEIGHT_MM = 53.98;
  const CSS_PIXELS_PER_MM = 96 / 25.4;
  const NOMINAL_CARD_WIDTH_PX = CARD_WIDTH_MM * CSS_PIXELS_PER_MM;
  const VIEWING_DISTANCE_MM = 2000;
  const TRIALS_PER_LEVEL = 3;
  const REQUIRED_CORRECT = 2;
  const ORIENTATIONS = Object.freeze(["up", "down", "left", "right"]);
  const ACUITY_LEVELS = Object.freeze([200, 100, 70, 50, 40, 30, 25, 20].map((denominator) => Object.freeze({
    denominator,
    label: `20/${denominator}`,
  })));

  function chooseOrientation(previousOrientation, random = Math.random) {
    const choices = ORIENTATIONS.filter((orientation) => orientation !== previousOrientation);
    return choices[Math.floor(random() * choices.length)];
  }

  function calculateOptotypeSize(levelIndex, calibrationScale, viewingDistanceMm = VIEWING_DISTANCE_MM) {
    const level = ACUITY_LEVELS[levelIndex];
    if (!level) return 0;

    if (Number.isFinite(calibrationScale) && calibrationScale > 0) {
      const fiveArcMinutesInRadians = (5 / 60) * (Math.PI / 180);
      const optotypeHeightMm = 2 * viewingDistanceMm * Math.tan(fiveArcMinutesInRadians / 2);
      return optotypeHeightMm * (level.denominator / 20) * calibrationScale;
    }

    return 112 * (level.denominator / 200);
  }

  function formatResult(result) {
    if (result === "unavailable" || !result) return "النتيجة غير متاحة";
    if (result === "below") return "لم يتم تحديد حدة الإبصار ضمن نطاق هذا الاختبار.";
    return result;
  }

  function interpretAcuity(result, options = {}) {
    const eyeLabel = options.eyeLabel || "هذه العين";
    if (options.calibrated === false || result === "unavailable" || !result) {
      return `لا تتوفر نتيجة قابلة للتفسير لـ${eyeLabel} لأن معايرة حجم العرض أو شروط المسافة لم تكتمل. أعد الفحص بعد المعايرة ومن المسافة المحددة.`;
    }

    if (result === "below") {
      return `${eyeLabel}: لم يتحقق معيار النجاح في مستوى 20/200، لذلك لا يمكن إعطاء كسر سنلن أدق أو افتراض 20/200. أعد الفحص في ظروف مناسبة، وراجع مختصًا إذا تكررت الصعوبة.`;
    }

    const denominator = Number(String(result).split("/")[1]);
    if (!Number.isFinite(denominator)) {
      return `لا تتوفر بيانات كافية لتفسير نتيجة ${eyeLabel}.`;
    }

    const meaning = denominator === 20
      ? "وصلت إلى مستوى 20/20 ضمن هذا الفحص؛ وهو مستوى مرجعي لحدة النظر عن بُعد وليس ضمانًا لاكتمال صحة العين"
      : `أصغر مستوى نجحت فيه هو ${result}؛ وهذا أداء أقل من المستوى المرجعي 20/20 ضمن ظروف الفحص الحالية`;
    return `${eyeLabel}: ${meaning}. قد يرتبط الأداء الأقل بخطأ انكساري أو ظروف العرض والمسافة أو أسباب أخرى. النتيجة تعليمية ولا تشخّص مرضًا ولا تعطي وصفة نظارة؛ أعد الاختبار عند الشك وراجع اختصاصي عيون إذا تكررت الصعوبة أو أثرت في الرؤية اليومية.`;
  }

  function getResultExplanation(result) {
    return interpretAcuity(result);
  }

  function createTestSession() {
    // Prototype rule: a level is passed with at least 2 correct responses out of 3.
    // The final value is the smallest passed level, never a percentage across levels.
    let levelIndex = 0;
    let trialCount = 0;
    let correctAnswers = 0;
    let currentOrientation = null;
    let previousOrientation = null;

    return {
      nextTrial(random = Math.random) {
        currentOrientation = chooseOrientation(previousOrientation, random);
        previousOrientation = currentOrientation;
        return {
          orientation: currentOrientation,
          levelIndex,
          trialNumber: trialCount + 1,
          totalLevels: ACUITY_LEVELS.length,
          trialsPerLevel: TRIALS_PER_LEVEL,
        };
      },
      submit(direction) {
        if (!currentOrientation) return { status: "inactive" };
        trialCount += 1;
        if (direction === currentOrientation) correctAnswers += 1;
        currentOrientation = null;

        if (trialCount < TRIALS_PER_LEVEL) {
          return { status: "next-trial" };
        }

        const passed = correctAnswers >= REQUIRED_CORRECT;
        if (!passed) {
          return {
            status: "complete",
            result: levelIndex === 0 ? "below" : ACUITY_LEVELS[levelIndex - 1].label,
          };
        }

        if (levelIndex === ACUITY_LEVELS.length - 1) {
          return { status: "complete", result: ACUITY_LEVELS[levelIndex].label };
        }

        levelIndex += 1;
        trialCount = 0;
        correctAnswers = 0;
        return { status: "next-level" };
      },
      getState() {
        return { levelIndex, trialCount, correctAnswers, currentOrientation };
      },
    };
  }

  window.EyeCareVisionEngine = Object.freeze({
    CARD_WIDTH_MM,
    CARD_HEIGHT_MM,
    NOMINAL_CARD_WIDTH_PX,
    VIEWING_DISTANCE_MM,
    TRIALS_PER_LEVEL,
    REQUIRED_CORRECT,
    ORIENTATIONS,
    ACUITY_LEVELS,
    chooseOrientation,
    calculateOptotypeSize,
    formatResult,
    interpretAcuity,
    getResultExplanation,
    createTestSession,
  });
})();
