"use strict";

const assert = require("node:assert/strict");

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
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else if (message.method) this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
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

  async function evaluate(expression) {
    const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  const pages = [
    "/index.html",
    "/pages/color-vision-test.html",
    "/pages/vision-test.html",
    "/pages/contrast-sensitivity-test.html",
    "/pages/astigmatism-test.html",
    "/pages/peripheral-vision-test.html",
    "/pages/reaction-time-test.html",
    "/pages/eye-tracking-test.html",
    "/pages/history.html"
  ];

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    await client.send("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1, mobile: false });
    for (const path of pages) {
      await client.send("Page.navigate", { url: `http://127.0.0.1:8765${path}` });
      await wait(220);
      const state = await evaluate(`({
        title: document.title,
        main: Boolean(document.querySelector("main")),
        viewportWidth: window.innerWidth,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        missing: [...document.querySelectorAll("link[href], script[src], img[src]")].filter((node) => node.tagName === "IMG" && node.complete && !node.naturalWidth).length
      })`);
      assert.ok(state.title, `${path} has no title`);
      assert.equal(state.main, true, `${path} has no main landmark`);
      assert.equal(state.viewportWidth, viewport.width, `${path} did not use the requested viewport`);
      assert.equal(state.overflow, false, `${path} overflows at ${viewport.width}px`);
      assert.equal(state.missing, 0, `${path} has a broken image`);
    }
  }

  await client.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/color-vision-test.html" });
  await wait(220);
  const colorResults = await evaluate(`(() => {
    const originalSetTimeout = window.setTimeout;
    window.setTimeout = (callback) => { callback(); return 1; };
    const answers = ['5', '17', '42', '3', '26', '9', '64', '7', '31', '15'];
    const begin = () => { document.querySelector('[data-color-action="start"]').click(); document.querySelector('[data-color-action="ready"]').click(); };
    begin();
    answers.forEach((answer) => {
      const input = document.querySelector('[data-color-answer]'); input.value = answer;
      document.querySelector('[data-color-answer-form]').requestSubmit();
    });
    const high = document.querySelector('[data-interpretation-text]').textContent;
    document.querySelector('[data-color-action="restart"]').click(); begin();
    answers.forEach(() => document.querySelector('[data-no-number]').click());
    const low = document.querySelector('[data-interpretation-text]').textContent;
    window.setTimeout = originalSetTimeout;
    return { high, low };
  })()`);
  assert.match(colorResults.high, /10 من 10/);
  assert.match(colorResults.low, /0 من 10/);
  assert.match(colorResults.low, /معايرة الشاشة/);

  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/contrast-sensitivity-test.html" });
  await wait(250);
  const result = await evaluate(`(async () => {
    document.querySelector('[data-action="start"]').click();
    for (let index = 0; index < 6; index += 1) {
      const direction = document.querySelector('[data-symbol]').dataset.direction;
      document.querySelector('[data-direction="' + direction + '"]').click();
    }
    document.querySelector('[data-action="save"]').click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    const dialog = document.querySelector('[data-report-name-dialog]');
    const result = {
      resultVisible: !document.querySelector('[data-step="results"]').hidden,
      dialogOpen: dialog?.open,
      defaultName: dialog?.querySelector('input').value,
      reviewTrials: 6
    };
    dialog?.querySelector('[data-report-name-cancel]').click();
    document.querySelector('[data-action="review"]').click();
    result.reviewOpen = document.querySelector('[data-answer-review-dialog]')?.open;
    result.reviewCounter = document.querySelector('[data-review-counter]')?.textContent;
    return result;
  })()`);
  assert.equal(result.resultVisible, true);
  assert.equal(result.dialogOpen, true);
  assert.match(result.defaultName, /فحص حساسية التباين/);
  assert.equal(result.reviewOpen, true);
  assert.ok(result.reviewCounter);

  const lowContrastResult = await evaluate(`(() => {
    document.querySelector('[data-review-close]').click();
    document.querySelector('[data-action="restart"]').click();
    document.querySelector('[data-action="start"]').click();
    for (let index = 0; index < 6; index += 1) {
      const direction = document.querySelector('[data-symbol]').dataset.direction;
      document.querySelector('[data-direction="' + (direction === 'up' ? 'down' : 'up') + '"]').click();
    }
    return document.querySelector('[data-interpretation]').textContent;
  })()`);
  assert.match(lowContrastResult, /0 من 6/);
  assert.match(lowContrastResult, /الشاشة والسطوع والإضاءة/);

  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/astigmatism-test.html" });
  await wait(220);
  const astigmatismResult = await evaluate(`(() => {
    document.querySelector('[data-action="start"]').click();
    document.querySelector('[data-response="different"]').click();
    document.querySelector('[data-line-id="line-2"]').click();
    document.querySelector('[data-action="confirm-lines"]').click();
    document.querySelector('[data-response="equal"]').click();
    const interpretation = document.querySelector('[data-interpretation]').textContent;
    document.querySelector('[data-action="review"]').click();
    const singleEye = {
      interpretation,
      subjectiveLabel: document.querySelector('[data-review-correct-label]').textContent,
      verdictHidden: document.querySelector('[data-review-verdict]').hidden,
      subjectiveExplanation: document.querySelector('[data-review-correct]').textContent
    };
    document.querySelector('[data-review-close]').click();
    document.querySelector('[data-action="restart"]').click();
    document.querySelector('[data-action="start"]').click();
    document.querySelector('[data-response="equal"]').click();
    document.querySelector('[data-response="equal"]').click();
    singleEye.equalInterpretation = document.querySelector('[data-interpretation]').textContent;
    document.querySelector('[data-action="restart"]').click();
    document.querySelector('[data-action="start"]').click();
    document.querySelector('[data-response="unsure"]').click();
    document.querySelector('[data-response="unsure"]').click();
    singleEye.unsureInterpretation = document.querySelector('[data-interpretation]').textContent;
    return singleEye;
  })()`);
  assert.match(astigmatismResult.interpretation, /لاحظت اختلافًا/);
  assert.match(astigmatismResult.equalInterpretation, /لم تلاحظ اختلافًا واضحًا/);
  assert.match(astigmatismResult.unsureInterpretation, /لم تتمكن من تحديد/);
  assert.equal(astigmatismResult.subjectiveLabel, "ماذا تعني إجابتك؟");
  assert.equal(astigmatismResult.verdictHidden, true);
  assert.match(astigmatismResult.subjectiveExplanation, /اختلاف/);

  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/peripheral-vision-test.html" });
  await wait(220);
  const peripheralResult = await evaluate(`(async () => {
    const fixation = document.querySelector('[data-practice-stage] .fixation');
    document.querySelector('[data-action="start"]').click();
    const countdownStarted = document.querySelector('[data-peripheral-countdown]').textContent === '5';
    document.querySelector('[data-action="back-to-instructions"]').click();
    await new Promise((resolve) => setTimeout(resolve, 1100));
    return {
      countdownStarted,
      returnedToSetup: !document.querySelector('[data-step="setup"]').hidden,
      practiceDoesNotUseResultCounter: !document.querySelector('[data-step="practice"]').textContent.includes('من 8'),
      fixationColor: getComputedStyle(fixation).color,
      fixationWeight: getComputedStyle(fixation).fontWeight
    };
  })()`);
  assert.equal(peripheralResult.countdownStarted, true);
  assert.equal(peripheralResult.returnedToSetup, true);
  assert.equal(peripheralResult.practiceDoesNotUseResultCounter, true);
  assert.notEqual(peripheralResult.fixationColor, "rgb(255, 255, 255)");
  assert.ok(Number(peripheralResult.fixationWeight) >= 700);

  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/reaction-time-test.html" });
  await wait(220);
  const reactionResult = await evaluate(`({
    hasHelp: Boolean(document.querySelector('.reaction-help')),
    hasTrialDetails: Boolean(document.querySelector('[data-trial-details]')),
    setupText: document.querySelector('[data-step="setup"]').textContent
  })`);
  assert.equal(reactionResult.hasHelp, true);
  assert.equal(reactionResult.hasTrialDetails, true);
  assert.match(reactionResult.setupText, /لا تضغط قبل ظهورها/);

  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/eye-tracking-test.html" });
  await wait(250);
  const cameraLifecycle = await evaluate(`(async () => {
    let stopped = 0; let closed = 0;
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) } });
    window.EyeCareFaceLandmarker = { create: async () => ({ delegate: 'CPU', landmarker: { detectForVideo: () => ({ faceLandmarks: [] }), close: () => { closed += 1; } } }) };
    const video = document.querySelector('[data-camera-video]');
    Object.defineProperty(video, 'srcObject', { configurable: true, writable: true, value: null });
    Object.defineProperty(video, 'videoWidth', { configurable: true, value: 1280 });
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 720 });
    video.play = async () => {}; video.pause = () => {};
    document.querySelector('[data-camera-action="start"]').click();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const started = !document.querySelector('[data-camera-action="stop"]').disabled;
    document.querySelector('[data-camera-action="pause"]').click();
    const paused = !document.querySelector('[data-camera-action="resume"]').hidden;
    document.querySelector('[data-camera-action="resume"]').click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const resumed = !document.querySelector('[data-camera-action="pause"]').hidden;
    document.querySelector('[data-camera-action="stop"]').click();
    return { started, paused, resumed, stopped, closed, stoppedButton: document.querySelector('[data-camera-action="stop"]').disabled };
  })()`);
  assert.equal(cameraLifecycle.started, true);
  assert.equal(cameraLifecycle.paused, true);
  assert.equal(cameraLifecycle.resumed, true);
  assert.equal(cameraLifecycle.stopped, 1);
  assert.equal(cameraLifecycle.closed, 1);
  assert.equal(cameraLifecycle.stoppedButton, true);

  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/history.html" });
  await wait(250);
  await evaluate(`(() => {
    localStorage.setItem('eyecare_ai_history', JSON.stringify({ schemaVersion: 1, records: [
      { id: 'new-record', type: 'contrast-sensitivity', title: 'تقرير جديد', date: new Date().toISOString(), summary: '6 من 6', resultData: { interpretation: 'نتيجة', reviewData: { kind: 'contrast-sensitivity', trials: [{ label: 'المحاولة 1', userAnswer: 'يمين', correctAnswer: 'يمين', isCorrect: true, stimulus: { direction: 'right', contrast: 1 } }] } } },
      { id: 'old-record', type: 'vision', title: 'تقرير قديم', date: new Date().toISOString(), summary: 'نتيجة قديمة', resultData: { rightEye: '6/6', leftEye: '6/6' } }
    ] }));
  })()`);
  await client.send("Page.reload", { ignoreCache: true });
  await wait(250);
  const historyResult = await evaluate(`(async () => {
    const oldCard = document.querySelector('[data-record-id="old-record"]');
    const newCard = document.querySelector('[data-record-id="new-record"]');
    const oldHasReview = Boolean(oldCard?.querySelector('[data-history-action="review"]'));
    const newHasReview = Boolean(newCard?.querySelector('[data-history-action="review"]'));
    oldCard.querySelector('[data-history-action="details"]').click();
    const oldNeutralExplanation = document.querySelector('[data-detail-list]').textContent.includes('لا يتوفر تفسير تفصيلي');
    document.querySelector('[data-close-details]').click();
    newCard.querySelector('[data-history-action="rename"]').click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const dialog = document.querySelector('[data-report-name-dialog]');
    dialog.querySelector('input').value = 'اسم مخصص';
    dialog.querySelector('form').requestSubmit();
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      oldVisible: Boolean(oldCard),
      oldHasReview,
      newHasReview,
      oldNeutralExplanation,
      renamed: JSON.parse(localStorage.getItem('eyecare_ai_history')).records.find((item) => item.id === 'new-record').title,
      stableId: JSON.parse(localStorage.getItem('eyecare_ai_history')).records.find((item) => item.id === 'new-record').id
    };
  })()`);
  assert.equal(historyResult.oldVisible, true);
  assert.equal(historyResult.oldHasReview, false);
  assert.equal(historyResult.newHasReview, true);
  assert.equal(historyResult.oldNeutralExplanation, true);
  assert.equal(historyResult.renamed, "اسم مخصص");
  assert.equal(historyResult.stableId, "new-record");

  const errors = client.events.filter((event) => event.method === "Runtime.exceptionThrown"
    || (event.method === "Log.entryAdded"
      && ["error", "warning"].includes(event.params.entry.level)
      && !event.params.entry.url?.endsWith("/favicon.ico")));
  assert.deepEqual(errors, [], `Browser errors: ${JSON.stringify(errors)}`);
  client.socket.close();
  console.log("Interactive exams smoke tests passed on desktop and mobile, including naming and review dialogs.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
