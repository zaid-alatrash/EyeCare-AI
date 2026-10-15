"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const context = {
  window: {},
  document: { querySelector: () => null },
  console,
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, "js", "vision-engine.js"), "utf8"), context);
vm.runInContext(fs.readFileSync(path.join(root, "js", "vision-realtime.js"), "utf8"), context);

const engine = context.window.EyeCareVisionEngine;
const realtime = context.window.EyeCareRealtimeVision;

assert.equal(engine.ACUITY_LEVELS.length, 8);
assert.equal(engine.TRIALS_PER_LEVEL, 3);
assert.equal(engine.REQUIRED_CORRECT, 2);
assert.notEqual(engine.chooseOrientation("left", () => 0), "left");
assert.ok(engine.calculateOptotypeSize(0, 3.7) > engine.calculateOptotypeSize(7, 3.7));

const passingSession = engine.createTestSession();
let trial = passingSession.nextTrial(() => 0);
let outcome = passingSession.submit(trial.orientation);
trial = passingSession.nextTrial(() => 0);
outcome = passingSession.submit(trial.orientation);
trial = passingSession.nextTrial(() => 0);
outcome = passingSession.submit("wrong");
assert.equal(outcome.status, "next-level");
assert.equal(passingSession.getState().levelIndex, 1);

const failingSession = engine.createTestSession();
for (let index = 0; index < 3; index += 1) {
  trial = failingSession.nextTrial(() => 0);
  outcome = failingSession.submit("wrong");
}
assert.equal(outcome.status, "complete");
assert.equal(outcome.result, "below");
assert.equal(engine.formatResult(outcome.result), "لم يتم تحديد حدة الإبصار ضمن نطاق هذا الاختبار.");
assert.match(engine.interpretAcuity(outcome.result), /لا يمكن إعطاء كسر سنلن أدق/);

const interruptedSession = engine.createTestSession();
trial = interruptedSession.nextTrial(() => 0);
outcome = interruptedSession.submit("wrong");
assert.equal(outcome.status, "next-trial", "an incomplete level must not produce a Snellen result");

const oneCorrectSession = engine.createTestSession();
for (let index = 0; index < 3; index += 1) {
  trial = oneCorrectSession.nextTrial(() => 0);
  outcome = oneCorrectSession.submit(index === 0 ? trial.orientation : "wrong");
}
assert.equal(outcome.result, "below", "one correct response is not enough to pass a level");

const secondLevelFailure = engine.createTestSession();
for (let index = 0; index < 3; index += 1) {
  trial = secondLevelFailure.nextTrial(() => 0);
  outcome = secondLevelFailure.submit(index < 2 ? trial.orientation : "wrong");
}
assert.equal(outcome.status, "next-level", "2 of 3 answers should pass a level");
for (let index = 0; index < 3; index += 1) {
  trial = secondLevelFailure.nextTrial(() => 0);
  outcome = secondLevelFailure.submit("wrong");
}
assert.equal(outcome.result, "20/200", "result should be the smallest previously passed level");

const allLevelsPassing = engine.createTestSession();
do {
  trial = allLevelsPassing.nextTrial(() => 0);
  outcome = allLevelsPassing.submit(trial.orientation);
} while (outcome.status !== "complete");
assert.equal(outcome.result, "20/20");
assert.match(engine.interpretAcuity(outcome.result), /وصلت إلى مستوى 20\/20 ضمن هذا الفحص/);
assert.equal(engine.formatResult("unavailable"), "النتيجة غير متاحة");
assert.match(engine.interpretAcuity("unavailable", { calibrated: false }), /المعايرة/);

assert.equal(realtime.estimateDistance(0.2, 0.1, 1), 2);
assert.equal(realtime.estimateDistance(0, 0.1, 1), null);

function handWithIndexVector(dx, dy) {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.62 }));
  landmarks[0] = { x: 0.5, y: 0.7 };
  landmarks[5] = { x: 0.5, y: 0.57 };
  landmarks[6] = { x: 0.5, y: 0.48 };
  landmarks[8] = { x: 0.5 + dx, y: 0.48 + dy };
  landmarks[9] = { x: 0.5, y: 0.57 };
  landmarks[12] = { x: 0.5, y: 0.64 };
  landmarks[16] = { x: 0.48, y: 0.65 };
  landmarks[20] = { x: 0.46, y: 0.66 };
  return landmarks;
}

assert.equal(realtime.classifyPointingGesture(handWithIndexVector(0, -0.18)), "up");
assert.equal(realtime.classifyPointingGesture(handWithIndexVector(0, 0.28)), "down");
assert.equal(realtime.classifyPointingGesture(handWithIndexVector(-0.18, 0), true), "right");
assert.equal(realtime.classifyPointingGesture(handWithIndexVector(0.18, 0), true), "left");
assert.equal(realtime.classifyPointingGesture(handWithIndexVector(-0.18, 0), false), "left");
assert.equal(realtime.classifyPointingGesture(handWithIndexVector(0.1, 0.1)), null);

const filter = new realtime.TemporalGestureFilter(650);
assert.equal(filter.update("up", 0), null);
assert.equal(filter.update("up", 649), null);
assert.equal(filter.update("up", 650), "up");
assert.equal(filter.update(null, 700), null);

const distanceHold = new realtime.StableConditionTimer(2000);
assert.equal(distanceHold.update(true, 1000).ready, false);
assert.equal(distanceHold.update(true, 2999).ready, false);
assert.equal(distanceHold.update(false, 3000).progress, 0);
assert.equal(distanceHold.update(true, 4000).ready, false);
assert.equal(distanceHold.update(true, 6000).ready, true);

let scheduledTick = null;
let cleared = false;
const ticks = [];
let completed = false;
const countdown = new realtime.CancellableCountdown(
  (value) => ticks.push(value),
  () => { completed = true; },
  (callback) => { scheduledTick = callback; return 7; },
  () => { cleared = true; },
);
countdown.start(3);
assert.deepEqual(ticks, [3]);
scheduledTick();
assert.deepEqual(ticks, [3, 2]);
assert.equal(countdown.cancel(), true);
assert.equal(cleared, true);
assert.equal(completed, false);

let completionTick = null;
let completionCalled = false;
const completingCountdown = new realtime.CancellableCountdown(
  () => {},
  () => { completionCalled = true; },
  (callback) => { completionTick = callback; return 8; },
  () => {},
);
completingCountdown.start(3);
completionTick();
completionTick();
completionTick();
assert.equal(completionCalled, true);
assert.equal(completingCountdown.active, false);

const acceptanceBase = {
  automationMode: "testing",
  answerLocked: false,
  needsNeutral: false,
  cooldownUntil: 0,
  now: 100,
  distanceAllowed: true,
  sizeValid: true,
};
assert.equal(realtime.isAnswerAcceptanceAllowed(acceptanceBase), true);
assert.equal(realtime.isAnswerAcceptanceAllowed({ ...acceptanceBase, automationMode: "countdown-start" }), false);
assert.equal(realtime.isAnswerAcceptanceAllowed({ ...acceptanceBase, distanceAllowed: false }), false);
assert.equal(realtime.isAnswerAcceptanceAllowed({ ...acceptanceBase, needsNeutral: true }), false);
assert.equal(realtime.isAnswerAcceptanceAllowed({ ...acceptanceBase, sizeValid: false }), false);

console.log("Vision engine, countdown, distance gating, and gesture helper tests passed.");
