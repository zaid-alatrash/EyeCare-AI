"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "pages", "eye-tracking-test.html"), "utf8");
const script = fs.readFileSync(path.join(root, "js", "eye-tracking-test.js"), "utf8");
for (const key of ["camera", "face", "eyes", "calibration", "tracking"]) {
  assert.match(html, new RegExp(`data-diagnostic="${key}"`));
}
assert.match(html, /data-retry-calibration/);
for (const feature of ["retryCalibration", "calibration-failed", "setDiagnostics", "waitForVideoDimensions", "console.warn"]) {
  assert.match(script, new RegExp(feature));
}
console.log("Eye-tracking diagnostic states, retry calibration, and readiness guards passed.");
