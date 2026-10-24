"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

class CdpClient {
  constructor(url) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.socket = new WebSocket(url);
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        this.events.push(message);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

(async () => {
  const targets = await fetch("http://127.0.0.1:9223/json").then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  assert.ok(page, "Browser target was not found");

  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Log.enable");
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/vision-test.html" });
  await wait(300);
  await client.send("Page.reload", { ignoreCache: true });
  await wait(500);

  async function evaluate(expression) {
    const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text;
      throw new Error(description);
    }
    return result.result.value;
  }

  let state = await evaluate(`({
    manualVisible: !document.querySelector('[data-vision-app]').hidden,
    realtimeHidden: document.querySelector('[data-realtime-app]').hidden,
    engineLevels: window.EyeCareVisionEngine?.ACUITY_LEVELS.length,
    helperLoaded: Boolean(window.EyeCareRealtimeVision),
    title: document.title
  })`);
  assert.equal(state.title, "اختبار حدة النظر | EyeCare AI");
  assert.equal(state.manualVisible, true);
  assert.equal(state.realtimeHidden, true);
  assert.equal(state.engineLevels, 8);
  assert.equal(state.helperLoaded, true);

  await evaluate("document.querySelector('[data-open-realtime]').click()");
  state = await evaluate(`({
    manualHidden: document.querySelector('[data-vision-app]').hidden,
    realtimeVisible: !document.querySelector('[data-realtime-app]').hidden,
    setupVisible: !document.querySelector('[data-rt-section="setup"]').hidden
  })`);
  assert.deepEqual(state, { manualHidden: true, realtimeVisible: true, setupVisible: true });
  state = await evaluate(`({
    phases: document.querySelectorAll('[data-rt-phase-step]').length,
    readyLabel: document.querySelector('[data-rt-action="ready"]')?.textContent.trim(),
    fallbackDirections: document.querySelectorAll('[data-rt-manual-direction]').length
  })`);
  assert.equal(state.phases, 3);
  assert.equal(state.readyLabel, "أنا جاهز");
  assert.equal(state.fallbackDirections, 4);

  state = await evaluate(`(() => {
    const app = document.querySelector('[data-realtime-app]');
    const camera = document.querySelector('[data-rt-section="camera"]');
    const setup = document.querySelector('[data-rt-section="setup"]');
    const testing = document.querySelector('[data-rt-stage="testing"]');
    app.dataset.rtPhase = 'examination';
    camera.hidden = false;
    setup.hidden = true;
    document.querySelectorAll('[data-rt-stage]').forEach((stage) => { stage.hidden = true; });
    testing.hidden = false;
    const cameraRect = document.querySelector('.camera-frame').getBoundingClientRect();
    const examRect = document.querySelector('.realtime-optotype-area').getBoundingClientRect();
    const result = {
      columns: getComputedStyle(camera).gridTemplateColumns.split(' ').length,
      cameraVisible: cameraRect.width > 0 && cameraRect.height > 0,
      examVisible: examRect.width > 0 && examRect.height > 0,
      cameraBeforeExam: cameraRect.left < examRect.left,
      noOverlap: cameraRect.right <= examRect.left
    };
    return result;
  })()`);
  assert.equal(state.columns, 2);
  assert.equal(state.cameraVisible, true);
  assert.equal(state.examVisible, true);
  assert.equal(state.cameraBeforeExam, true);
  assert.equal(state.noOverlap, true);
  if (process.env.EYECARE_CAPTURE) {
    await evaluate("document.querySelector('[data-rt-section=\"camera\"]').scrollIntoView({ block: 'start' })");
    await wait(100);
    const capture = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(process.env.EYECARE_CAPTURE, Buffer.from(capture.data, "base64"));
  }
  await evaluate(`(() => {
    const app = document.querySelector('[data-realtime-app]');
    app.dataset.rtPhase = 'preparation';
    document.querySelector('[data-rt-section="camera"]').hidden = true;
    document.querySelector('[data-rt-section="setup"]').hidden = false;
    document.querySelectorAll('[data-rt-stage]').forEach((stage) => { stage.hidden = true; });
    document.querySelector('[data-rt-stage="screen-calibration"]').hidden = false;
  })()`);

  await evaluate(`Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => { throw new DOMException('Denied for test', 'NotAllowedError'); } }
  })`);
  await evaluate("document.querySelector('[data-rt-action=" + '"start-camera"' + "]').click()");
  await wait(150);
  state = await evaluate(`({
    alert: document.querySelector('[data-rt-alert]').textContent.replace(/\\s+/g, ' ').trim(),
    setupVisible: !document.querySelector('[data-rt-section="setup"]').hidden,
    cameraHidden: document.querySelector('[data-rt-section="camera"]').hidden
  })`);
  assert.match(state.alert, /تم رفض إذن الكاميرا/);
  assert.equal(state.setupVisible, true);
  assert.equal(state.cameraHidden, true);

  await evaluate("document.querySelector('[data-rt-action=" + '"close"' + "]').click()");
  await evaluate("document.querySelector('[data-action=" + '"start"' + "]').click()");
  state = await evaluate(`({
    manualVisible: !document.querySelector('[data-vision-app]').hidden,
    calibrationVisible: !document.querySelector('[data-step="calibration"]').hidden,
    progressVisible: !document.querySelector('[data-manual-vision].vision-progress').hidden
  })`);
  assert.deepEqual(state, { manualVisible: true, calibrationVisible: true, progressVisible: true });

  state = await evaluate(`(async () => {
    document.querySelector('[data-action="skip-calibration"]').click();
    document.querySelector('[data-action="ready"]').click();
    const wrong = async () => {
      const current = document.querySelector('[data-optotype]').dataset.direction;
      const answer = current === 'up' ? 'down' : 'up';
      document.querySelector('.direction-pad [data-direction="' + answer + '"]').click();
      await new Promise((resolve) => setTimeout(resolve, 340));
    };
    await wrong(); await wrong(); await wrong();
    document.querySelector('[data-action="start-left"]').click();
    await wrong(); await wrong(); await wrong();
    const result = {
      right: document.querySelector('[data-right-result]').textContent,
      left: document.querySelector('[data-left-result]').textContent,
      calibration: document.querySelector('[data-calibration-result]').textContent,
      explanation: document.querySelector('[data-right-explanation]').textContent
    };
    return result;
  })()`);
  assert.equal(state.right, "النتيجة غير متاحة");
  assert.equal(state.left, "النتيجة غير متاحة");
  assert.match(state.calibration, /لا يُعرض كسر سنلن/);
  assert.match(state.explanation, /لا تتوفر نتيجة قابلة للتفسير/);

  await client.send("Page.reload", { ignoreCache: true });
  await wait(300);
  state = await evaluate(`(async () => {
    const click = async (direction) => {
      document.querySelector('.direction-pad [data-direction="' + direction + '"]').click();
      await new Promise((resolve) => setTimeout(resolve, 340));
    };
    const correct = () => click(document.querySelector('[data-optotype]').dataset.direction);
    const wrong = () => click(document.querySelector('[data-optotype]').dataset.direction === 'up' ? 'down' : 'up');
    const completeEyeAtThirdLevel = async () => {
      for (let level = 0; level < 2; level += 1) { await correct(); await correct(); await wrong(); }
      await wrong(); await wrong(); await wrong();
    };
    document.querySelector('[data-action="start"]').click();
    document.querySelector('[data-action="confirm-calibration"]').click();
    document.querySelector('[data-action="ready"]').click();
    await completeEyeAtThirdLevel();
    document.querySelector('[data-action="start-left"]').click();
    await completeEyeAtThirdLevel();
    const result = {
      right: document.querySelector('[data-right-result]').textContent,
      left: document.querySelector('[data-left-result]').textContent,
      explanation: document.querySelector('[data-right-explanation]').textContent
    };
    return result;
  })()`);
  assert.deepEqual({ right: state.right, left: state.left }, { right: "20/100", left: "20/100" });
  assert.match(state.explanation, /أصغر مستوى نجحت فيه هو 20\/100/);

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.reload", { ignoreCache: true });
  await wait(400);
  await evaluate("document.querySelector('[data-open-realtime]').click()");
  state = await evaluate(`({
    headerDirection: getComputedStyle(document.querySelector('.realtime-header')).flexDirection,
    requirementColumns: getComputedStyle(document.querySelector('.realtime-requirements')).gridTemplateColumns.split(' ').length,
    navToggleVisible: getComputedStyle(document.querySelector('[data-nav-toggle]')).display !== 'none',
    bodyOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
  })`);
  assert.equal(state.headerDirection, "column-reverse");
  assert.equal(state.requirementColumns, 1);
  assert.equal(state.navToggleVisible, true);
  assert.equal(state.bodyOverflow, true);
  state = await evaluate(`(() => {
    const app = document.querySelector('[data-realtime-app]');
    const camera = document.querySelector('[data-rt-section="camera"]');
    app.hidden = false;
    app.dataset.rtPhase = 'examination';
    camera.hidden = false;
    document.querySelector('[data-rt-section="setup"]').hidden = true;
    document.querySelectorAll('[data-rt-stage]').forEach((stage) => { stage.hidden = true; });
    document.querySelector('[data-rt-stage="testing"]').hidden = false;
    return {
      columns: getComputedStyle(camera).gridTemplateColumns.split(' ').length,
      cameraVisible: document.querySelector('.camera-frame').getBoundingClientRect().width > 0,
      examVisible: document.querySelector('.realtime-optotype-area').getBoundingClientRect().width > 0,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    };
  })()`);
  assert.equal(state.columns, 1);
  assert.equal(state.cameraVisible, true);
  assert.equal(state.examVisible, true);
  assert.equal(state.noHorizontalOverflow, true);

  client.events.length = 0;
  const sitePaths = [
    "/index.html",
    "/pages/oct-examination.html",
    "/pages/fundus-examination.html",
    "/pages/disease-guide.html",
    "/pages/disease-details.html?id=amd",
    "/pages/color-vision-test.html",
    "/pages/contrast-sensitivity-test.html",
    "/pages/astigmatism-test.html",
    "/pages/peripheral-vision-test.html",
    "/pages/reaction-time-test.html",
    "/pages/history.html",
    "/pages/vision-test.html",
  ];
  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const path of sitePaths) {
    await client.send("Page.navigate", { url: `http://127.0.0.1:8765${path}` });
    await wait(350);
    const pageState = await evaluate(`({
      title: document.title,
      hasMain: Boolean(document.querySelector('main')),
      brokenImages: [...document.images].filter((image) => image.getAttribute('src') && image.complete && image.naturalWidth === 0).map((image) => image.src),
      emptyServiceVisuals: [...document.querySelectorAll('.service-card__visual use')].filter((use) => {
        try { const box = use.getBBox(); return box.width === 0 || box.height === 0; } catch { return true; }
      }).length,
      noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
    })`);
    assert.ok(pageState.title, `${path} has no document title`);
    assert.equal(pageState.hasMain, true, `${path} has no main element`);
    assert.deepEqual(pageState.brokenImages, [], `${path} has broken images`);
    assert.equal(pageState.emptyServiceVisuals, 0, `${path} has empty service illustrations`);
    assert.equal(pageState.noHorizontalOverflow, true, `${path} has horizontal overflow`);
  }

  const errors = client.events.filter((event) =>
    event.method === "Runtime.exceptionThrown"
    || (event.method === "Log.entryAdded"
      && ["error", "warning"].includes(event.params.entry.level)
      && !event.params.entry.url?.endsWith("/favicon.ico"))
  );
  assert.equal(errors.length, 0, `Browser errors: ${JSON.stringify(errors)}`);

  await client.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/index.html" });
  await wait(400);
  state = await evaluate(`({
    serviceColumns: getComputedStyle(document.querySelector('.services-grid')).gridTemplateColumns.split(' ').length,
    visualWidth: document.querySelector('.service-card__visual').getBoundingClientRect().width,
    noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth
  })`);
  assert.equal(state.serviceColumns, 1);
  assert.ok(state.visualWidth > 0);
  assert.equal(state.noHorizontalOverflow, true);

  await client.send("Page.navigate", { url: pathToFileURL(path.resolve(__dirname, "..", "index.html")).href });
  await wait(500);
  state = await evaluate(`({
    title: document.title,
    serviceVisuals: document.querySelectorAll('.service-card__visual use').length,
    emptyServiceVisuals: [...document.querySelectorAll('.service-card__visual use')].filter((use) => {
      try { const box = use.getBBox(); return box.width === 0 || box.height === 0; } catch { return true; }
    }).length
  })`);
  assert.equal(state.title, "EyeCare AI | فحوصات العيون الذكية");
  assert.equal(state.serviceVisuals, 8);
  assert.equal(state.emptyServiceVisuals, 0, "homepage service illustrations must render when index.html is opened directly");
  client.close();
  console.log("Browser smoke tests passed for camera UI states, manual-test regression, responsive layout, and all existing pages.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
