"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

class CdpClient {
  constructor(url) { this.nextId = 1; this.pending = new Map(); this.socket = new WebSocket(url); }
  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
}

(async () => {
  const targets = await fetch("http://127.0.0.1:9223/json").then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  assert.ok(page, "Browser target was not found");
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.connect();
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url: "http://127.0.0.1:8765/pages/history.html" });
  await new Promise((resolve) => setTimeout(resolve, 450));
  const expression = `(async () => {
    const record = {
      id: 'pdf-sample', type: 'vision', title: 'تقرير فحص تجريبي', date: '2026-10-14T09:30:00+03:00',
      patientName: 'مريض تجريبي', summary: 'العين اليمنى: 20/20 · العين اليسرى: 20/40',
      resultData: {
        rightEye: '20/20', leftEye: '20/40', calibration: 'مكتملة',
        scoringRule: 'النجاح في المستوى يتطلب إجابتين صحيحتين من ثلاث محاولات.',
        rightInterpretation: 'وصلت العين اليمنى إلى مستوى 20/20 ضمن هذا الفحص.',
        leftInterpretation: 'أصغر مستوى نجحت فيه العين اليسرى هو 20/40.',
        interpretation: 'هذه نتيجة تعليمية تتأثر بالمعايرة والمسافة ولا تقدم تشخيصًا أو وصفة نظارة.'
      }
    };
    const doc = await EyeCareReport.buildPdf(record);
    const colorDoc = await EyeCareReport.buildPdf({
      id: 'pdf-color-sample', type: 'color-vision', title: 'اختبار رؤية الألوان',
      date: '2026-10-14T10:00:00+03:00', summary: '8 من 10',
      resultData: { score: 8, total: 10, interpretation: 'نتيجة تعليمية تحتاج إلى تقييم مختص عند وجود أعراض.' }
    });
    return { primary: doc.output('datauristring'), secondary: colorDoc.output('datauristring').slice(0, 40) };
  })()`;
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const dataUri = result.result.value.primary;
  assert.match(dataUri, /^data:application\/pdf/);
  assert.match(result.result.value.secondary, /^data:application\/pdf/, "a second examination type must generate a PDF");
  const bytes = Buffer.from(dataUri.split(",")[1], "base64");
  assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(bytes.length > 20000, "PDF should include the embedded Arabic font");
  const outputDir = path.join(__dirname, "..", "output", "pdf");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "EyeCare_AI_Report_2026-10-14.pdf");
  fs.writeFileSync(outputPath, bytes);
  client.socket.close();
  console.log(`Arabic PDF report generated: ${outputPath}`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
