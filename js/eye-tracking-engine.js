window.EyeCareCameraEngine = (() => {
  "use strict";

  const LEFT_EYE = [33, 160, 158, 133, 153, 144];
  const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function eyeAspectRatio(landmarks, indices) {
    if (!Array.isArray(landmarks) || !indices.every((index) => landmarks[index])) return null;
    const [outer, upperOuter, upperInner, inner, lowerInner, lowerOuter] = indices.map((index) => landmarks[index]);
    const width = distance(outer, inner);
    if (width < 0.001) return null;
    return (distance(upperOuter, lowerOuter) + distance(upperInner, lowerInner)) / (2 * width);
  }

  function averageEyeAspectRatio(landmarks) {
    const left = eyeAspectRatio(landmarks, LEFT_EYE);
    const right = eyeAspectRatio(landmarks, RIGHT_EYE);
    return left === null || right === null ? null : (left + right) / 2;
  }

  class BlinkDetector {
    constructor({ closeThreshold = 0.2, openThreshold = 0.235, minClosedMs = 65, refractoryMs = 180 } = {}) {
      Object.assign(this, { closeThreshold, openThreshold, minClosedMs, refractoryMs });
      this.reset();
    }
    reset() { this.closedAt = null; this.lastBlinkAt = -Infinity; this.count = 0; }
    update(ear, now, faceVisible = true) {
      if (!faceVisible || !Number.isFinite(ear)) { this.closedAt = null; return { blink: false, count: this.count }; }
      if (ear <= this.closeThreshold && this.closedAt === null) this.closedAt = now;
      if (ear >= this.openThreshold && this.closedAt !== null) {
        const duration = now - this.closedAt;
        const blink = duration >= this.minClosedMs && now - this.lastBlinkAt >= this.refractoryMs;
        this.closedAt = null;
        if (blink) { this.count += 1; this.lastBlinkAt = now; }
        return { blink, count: this.count };
      }
      return { blink: false, count: this.count };
    }
  }

  function center(points) {
    return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
  }

  function estimateGaze(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length < 478) return { reliable: false, reason: "missing-iris" };
    const leftIris = center(landmarks.slice(468, 473));
    const rightIris = center(landmarks.slice(473, 478));
    const leftOuter = landmarks[33]; const leftInner = landmarks[133];
    const rightOuter = landmarks[263]; const rightInner = landmarks[362];
    const nose = landmarks[1]; const faceLeft = landmarks[234]; const faceRight = landmarks[454];
    if (![leftOuter, leftInner, rightOuter, rightInner, nose, faceLeft, faceRight].every(Boolean)) return { reliable: false, reason: "missing-landmarks" };
    const leftWidth = Math.abs(leftInner.x - leftOuter.x);
    const rightWidth = Math.abs(rightOuter.x - rightInner.x);
    if (leftWidth < 0.005 || rightWidth < 0.005) return { reliable: false, reason: "eye-size" };
    const horizontal = (((leftIris.x - leftOuter.x) / (leftInner.x - leftOuter.x)) + ((rightIris.x - rightInner.x) / (rightOuter.x - rightInner.x))) / 2 - 0.5;
    const eyeY = (leftIris.y + rightIris.y) / 2;
    const upperY = (landmarks[159].y + landmarks[386].y) / 2;
    const lowerY = (landmarks[145].y + landmarks[374].y) / 2;
    const vertical = (eyeY - upperY) / Math.max(lowerY - upperY, 0.002) - 0.5;
    const faceCenterX = (faceLeft.x + faceRight.x) / 2;
    const headOffset = (nose.x - faceCenterX) / Math.max(Math.abs(faceRight.x - faceLeft.x), 0.01);
    if (Math.abs(headOffset) > 0.22) return { reliable: false, reason: "head-pose" };
    return { reliable: true, x: horizontal, y: vertical, headOffset };
  }

  function directionFromGaze(gaze, threshold = 0.08) {
    if (!gaze?.reliable) return null;
    if (Math.abs(gaze.x) < threshold && Math.abs(gaze.y) < threshold) return "center";
    if (Math.abs(gaze.x) > Math.abs(gaze.y)) return gaze.x > 0 ? "right" : "left";
    return gaze.y > 0 ? "down" : "up";
  }

  function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  function buildCalibration(samplesByDirection, minimumSamples = 3) {
    const entries = Object.entries(samplesByDirection || {});
    if (!entries.length || entries.some(([, samples]) => !Array.isArray(samples) || samples.length < minimumSamples)) return null;
    return Object.fromEntries(entries.map(([direction, samples]) => [direction, {
      x: median(samples.map((sample) => sample.x)),
      y: median(samples.map((sample) => sample.y)),
    }]));
  }

  function classifyCalibratedGaze(gaze, calibration) {
    if (!gaze?.reliable || !calibration) return null;
    const nearest = Object.entries(calibration)
      .map(([direction, point]) => ({ direction, distance: Math.hypot(gaze.x - point.x, gaze.y - point.y) }))
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest ? { direction: nearest.direction, distance: nearest.distance } : null;
  }

  function summarizeTracking(observations, minimumValid = 15) {
    const valid = observations.filter((item) => item.valid);
    const coveredTargets = new Set(valid.map((item) => item.target)).size;
    if (valid.length < minimumValid || coveredTargets < 3) return { reliable: false, validObservations: valid.length, matchedObservations: 0, consistency: null, coveredTargets };
    const matches = valid.filter((item) => item.estimated === item.target).length;
    return { reliable: true, validObservations: valid.length, matchedObservations: matches, consistency: Math.round((matches / valid.length) * 100), coveredTargets };
  }

  function interpretTracking(result) {
    if (!result?.reliable || !Number.isFinite(result.consistency)) {
      return `لا تتوفر نتيجة قابلة للتفسير؛ جُمعت ${result?.validObservations || 0} مشاهدة صالحة فقط أو لم تكن المعايرة والتتبع مستقرين بما يكفي. أعد الاختبار مع تثبيت الرأس وتحسين الإضاءة.`;
    }
    return `نجحت المعايرة، ثم تطابق اتجاه النظر التقديري مع الهدف في ${result.matchedObservations} من ${result.validObservations} مشاهدة صالحة (${result.consistency}% اتساق). انخفاض الاتساق داخل التمرين يعني أن الاتجاه المقدر لم يطابق الهدف كثيرًا، وقد يتأثر بحركة الرأس والإضاءة ووضوح القزحية والكاميرا. هذه نسبة تقنية وليست تشخيصًا لاضطراب حركة العين.`;
  }

  function interpretBlink(result) {
    if (!result || !Number.isFinite(result.rate) || result.validSeconds < 5) {
      return "مدة التتبع الصالح غير كافية لحساب معدل رمش مفيد. أعد القياس مع إبقاء الوجه والعينين واضحين.";
    }
    const reference = result.rate < 10
      ? "وهو أقل من المجال الوصفي الشائع للبالغين في الراحة (نحو 10–20 رمشة/دقيقة)"
      : result.rate > 20
        ? "وهو أعلى من المجال الوصفي الشائع للبالغين في الراحة (نحو 10–20 رمشة/دقيقة)"
        : "ويقع ضمن المجال الوصفي الشائع للبالغين في الراحة (نحو 10–20 رمشة/دقيقة)";
    const rateMeaning = result.rate < 10
      ? "قد ينخفض الرمش أثناء التركيز على الشاشة، وقد يسهم ذلك في انزعاج سطح العين لدى بعض الأشخاص."
      : result.rate > 20
        ? "قد يزداد الرمش مع التهيج أو الجفاف أو العوامل البيئية أو أسباب أخرى، ولا يحدد المعدل وحده سببًا معينًا."
        : "لا يبدو هذا المعدل غير مألوف ضمن سياق الراحة الوصفي، لكنه لا يثبت اكتمال صحة العين.";
    const quality = result.quality === "complete"
      ? "اكتملت مدة القياس المطلوبة."
      : "القياس جزئي؛ أعده للحصول على وصف أكثر استقرارًا.";
    return `رُصدت ${result.total} رمشات خلال ${result.validSeconds} ثانية من التتبع الصالح، بمعدل تقديري ${result.rate} رمشة/دقيقة، ${reference}. ${rateMeaning} ${quality} إذا استمر الجفاف أو الحرقان أو التهيج أو تذبذب الرؤية فاستشر مختصًا. هذا الوصف ليس تشخيصًا طبيًا.`;
  }

  return Object.freeze({ eyeAspectRatio, averageEyeAspectRatio, BlinkDetector, estimateGaze, directionFromGaze, buildCalibration, classifyCalibratedGaze, summarizeTracking, interpretTracking, interpretBlink });
})();
