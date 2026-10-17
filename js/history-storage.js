/*
 * EyeCare AI history schema v1
 * Storage shape: { schemaVersion: 1, records: HistoryRecord[] }
 * HistoryRecord: { id, type, title, date, summary, resultData }
 *
 * Uploaded medical images must never be added to resultData. This store is for
 * compact result metadata only and is intentionally independent from the UI.
 */
window.EyeCareHistory = (() => {
  "use strict";

  const STORAGE_KEY = "eyecare_ai_history";
  const SCHEMA_VERSION = 1;
  const SUPPORTED_TYPES = new Set([
    "vision",
    "letter-vision",
    "color-vision",
    "contrast-sensitivity",
    "astigmatism",
    "peripheral-vision",
    "reaction-time",
    "eye-tracking",
    "blink-detection",
    "oct",
    "fundus",
  ]);
  let lastError = null;

  function emptyStore() {
    return { schemaVersion: SCHEMA_VERSION, records: [] };
  }

  function setError(message) {
    lastError = message;
  }

  function clearError() {
    lastError = null;
  }

  function isValidRecord(record) {
    return Boolean(
      record &&
      typeof record.id === "string" &&
      SUPPORTED_TYPES.has(record.type) &&
      typeof record.title === "string" &&
      typeof record.date === "string" &&
      typeof record.summary === "string" &&
      record.resultData &&
      typeof record.resultData === "object" &&
      !Array.isArray(record.resultData)
    );
  }

  function readStore() {
    clearError();

    try {
      const rawValue = window.localStorage.getItem(STORAGE_KEY);
      if (!rawValue) return emptyStore();

      const parsed = JSON.parse(rawValue);
      if (
        !parsed ||
        parsed.schemaVersion !== SCHEMA_VERSION ||
        !Array.isArray(parsed.records)
      ) {
        setError("بيانات السجل المحفوظة غير مدعومة أو غير صالحة.");
        return emptyStore();
      }

      return {
        schemaVersion: SCHEMA_VERSION,
        records: parsed.records.filter(isValidRecord),
      };
    } catch (error) {
      setError("تعذر قراءة السجل المحفوظ في هذا المتصفح.");
      return emptyStore();
    }
  }

  function writeStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      clearError();
      return { success: true };
    } catch (error) {
      setError("تعذر حفظ السجل. قد تكون مساحة المتصفح غير متاحة أو ممتلئة.");
      return { success: false, error: lastError };
    }
  }

  function generateId() {
    if (window.crypto?.randomUUID) return `eyecare-${window.crypto.randomUUID()}`;
    const timePart = Date.now().toString(36);
    const randomPart = Math.random().toString(36).slice(2, 10);
    return `eyecare-${timePart}-${randomPart}`;
  }

  function cloneResultData(resultData) {
    return JSON.parse(JSON.stringify(resultData || {}));
  }

  function getHistory() {
    const store = readStore();
    return [...store.records].sort((first, second) => new Date(second.date) - new Date(first.date));
  }

  function getRecordById(id) {
    return getHistory().find((record) => record.id === id) || null;
  }

  function addRecord(recordInput) {
    if (
      !recordInput ||
      !SUPPORTED_TYPES.has(recordInput.type) ||
      typeof recordInput.title !== "string" ||
      typeof recordInput.summary !== "string"
    ) {
      return { success: false, error: "بيانات النتيجة غير مكتملة وتعذر حفظها." };
    }

    const store = readStore();
    const record = {
      id: generateId(),
      type: recordInput.type,
      title: recordInput.title,
      date: recordInput.date || new Date().toISOString(),
      summary: recordInput.summary,
      resultData: cloneResultData(recordInput.resultData),
    };

    const writeResult = writeStore({
      schemaVersion: SCHEMA_VERSION,
      records: [record, ...store.records],
    });

    return writeResult.success
      ? { success: true, record }
      : writeResult;
  }

  function deleteRecord(id) {
    const store = readStore();
    const nextRecords = store.records.filter((record) => record.id !== id);

    if (nextRecords.length === store.records.length) {
      return { success: false, error: "هذا التقرير لم يعد متاحًا." };
    }

    return writeStore({ schemaVersion: SCHEMA_VERSION, records: nextRecords });
  }

  function updateRecordTitle(id, title) {
    const cleanTitle = typeof title === "string" ? title.trim() : "";
    if (!cleanTitle) return { success: false, error: "يجب إدخال اسم صالح للتقرير." };

    const store = readStore();
    const recordIndex = store.records.findIndex((record) => record.id === id);
    if (recordIndex === -1) return { success: false, error: "هذا التقرير لم يعد متاحًا." };

    store.records[recordIndex] = { ...store.records[recordIndex], title: cleanTitle };
    const writeResult = writeStore(store);
    return writeResult.success
      ? { success: true, record: store.records[recordIndex] }
      : writeResult;
  }

  function clearHistory() {
    return writeStore(emptyStore());
  }

  function getLastError() {
    return lastError;
  }

  return Object.freeze({
    storageKey: STORAGE_KEY,
    schemaVersion: SCHEMA_VERSION,
    getHistory,
    addRecord,
    getRecordById,
    deleteRecord,
    updateRecordTitle,
    clearHistory,
    getLastError,
  });
})();
