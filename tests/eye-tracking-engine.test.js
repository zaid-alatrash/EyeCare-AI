"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "eye-tracking-engine.js"), "utf8"), context);
const engine = context.window.EyeCareCameraEngine;

const detector = new engine.BlinkDetector({ closeThreshold: 0.2, openThreshold: 0.24, minClosedMs: 60, refractoryMs: 180 });
assert.equal(detector.update(0.3, 0, true).count, 0);
assert.equal(detector.update(0.16, 100, true).count, 0);
assert.equal(detector.update(0.17, 150, true).count, 0);
assert.equal(detector.update(0.28, 180, true).count, 1, "a complete close-open cycle should count once");
assert.equal(detector.update(0.16, 220, true).count, 1);
assert.equal(detector.update(0.28, 250, true).count, 1, "short closure should not count");
detector.update(0.16, 420, true);
assert.equal(detector.update(0.28, 500, true).count, 2);
detector.update(0.16, 700, true);
detector.update(null, 760, false);
assert.equal(detector.update(0.28, 840, true).count, 2, "face loss should cancel a partial blink");

const insufficient = engine.summarizeTracking(Array.from({ length: 12 }, () => ({ valid: true, target: "left", estimated: "left" })));
assert.equal(insufficient.reliable, false);
assert.equal(insufficient.validObservations, 12);
assert.equal(insufficient.consistency, null);
const directions = ["center", "left", "right", "up", "down"];
const reliable = engine.summarizeTracking(Array.from({ length: 25 }, (_, index) => {
  const target = directions[index % directions.length];
  return { valid: true, target, estimated: index < 20 ? target : "center" };
}));
assert.equal(reliable.reliable, true);
assert.equal(reliable.consistency, 84);
assert.equal(engine.directionFromGaze({ reliable: false, x: 1, y: 0 }), null);
assert.equal(engine.directionFromGaze({ reliable: true, x: -0.2, y: 0 }), "left");
const calibration = engine.buildCalibration({
  center: [{ x: 0, y: 0 }, { x: 0.01, y: 0 }, { x: -0.01, y: 0 }],
  left: [{ x: -0.2, y: 0 }, { x: -0.21, y: 0.01 }, { x: -0.19, y: -0.01 }],
  right: [{ x: 0.2, y: 0 }, { x: 0.21, y: 0.01 }, { x: 0.19, y: -0.01 }],
});
assert.ok(calibration);
assert.equal(engine.classifyCalibratedGaze({ reliable: true, x: -0.18, y: 0 }, calibration).direction, "left");
assert.equal(engine.buildCalibration({ center: [{ x: 0, y: 0 }] }), null);
assert.match(engine.interpretTracking(reliable), /21 من 25/);
assert.match(engine.interpretTracking(insufficient), /لا تتوفر نتيجة/);
assert.match(engine.interpretBlink({ total: 5, validSeconds: 30, rate: 10, quality: "complete" }), /5 رمشات خلال 30 ثانية/);
assert.match(engine.interpretBlink({ total: 2, validSeconds: 30, rate: 4, quality: "complete" }), /ينخفض الرمش أثناء التركيز/);
assert.match(engine.interpretBlink({ total: 14, validSeconds: 30, rate: 28, quality: "complete" }), /التهيج أو الجفاف/);
assert.match(engine.interpretBlink({ total: 1, validSeconds: 3, rate: null, quality: "insufficient" }), /غير كافية/);

console.log("Blink-cycle filtering and non-fabricated eye-tracking result tests passed.");
