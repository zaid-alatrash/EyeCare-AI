(() => {
  "use strict";

  const ACCEPTED_EXTENSIONS = ["jpg", "jpeg", "png"];
  const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
  const MAX_FILE_SIZE = 10 * 1024 * 1024;

  class ExaminationUpload {
    constructor(root) {
      this.root = root;
      this.input = root.querySelector("[data-file-input]");
      this.dropZone = root.querySelector("[data-drop-zone]");
      this.emptyState = root.querySelector("[data-empty-state]");
      this.preview = root.querySelector("[data-preview]");
      this.previewImage = root.querySelector("[data-preview-image]");
      this.fileName = root.querySelector("[data-file-name]");
      this.fileMeta = root.querySelector("[data-file-meta]");
      this.replaceButton = root.querySelector("[data-replace-file]");
      this.removeButton = root.querySelector("[data-remove-file]");
      this.analysisButton = root.querySelector("[data-start-analysis]");
      this.message = root.querySelector("[data-upload-message]");
      this.selectedFile = null;
      this.objectUrl = null;

      this.bindEvents();
    }

    bindEvents() {
      this.dropZone.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        this.input.click();
      });

      this.dropZone.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          this.input.click();
        }
      });

      this.input.addEventListener("change", () => {
        if (this.input.files.length) this.handleFile(this.input.files[0]);
      });

      ["dragenter", "dragover"].forEach((eventName) => {
        this.dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          this.dropZone.classList.add("is-dragging");
        });
      });

      ["dragleave", "drop"].forEach((eventName) => {
        this.dropZone.addEventListener(eventName, (event) => {
          event.preventDefault();
          this.dropZone.classList.remove("is-dragging");
        });
      });

      this.dropZone.addEventListener("drop", (event) => {
        const [file] = event.dataTransfer.files;
        if (file) this.handleFile(file);
      });

      this.replaceButton.addEventListener("click", () => this.input.click());
      this.removeButton.addEventListener("click", () => this.clearFile());
      this.analysisButton.addEventListener("click", () => this.handleAnalysis());
      window.addEventListener("beforeunload", () => this.releaseObjectUrl());
    }

    validateFile(file) {
      const extension = file.name.split(".").pop().toLowerCase();
      const hasAcceptedExtension = ACCEPTED_EXTENSIONS.includes(extension);
      const hasAcceptedType = ACCEPTED_TYPES.includes(file.type);

      if (!hasAcceptedExtension || !hasAcceptedType) {
        return "اختر صورة بصيغة JPG أو JPEG أو PNG.";
      }

      if (file.size > MAX_FILE_SIZE) {
        return "حجم الصورة أكبر من 10 MB. اختر ملفًا أصغر.";
      }

      return null;
    }

    handleFile(file) {
      const validationError = this.validateFile(file);

      if (validationError) {
        this.input.value = "";
        this.showMessage(validationError, "error");
        return;
      }

      this.releaseObjectUrl();
      this.selectedFile = file;
      this.objectUrl = URL.createObjectURL(file);
      this.previewImage.src = this.objectUrl;
      this.previewImage.alt = `معاينة الصورة المختارة: ${file.name}`;
      this.fileName.textContent = file.name;
      this.fileMeta.textContent = `${this.formatFileSize(file.size)} · ${file.type === "image/png" ? "PNG" : "JPEG"}`;
      this.emptyState.hidden = true;
      this.preview.hidden = false;
      this.clearMessage();
    }

    clearFile() {
      this.releaseObjectUrl();
      this.selectedFile = null;
      this.input.value = "";
      this.previewImage.removeAttribute("src");
      this.previewImage.alt = "";
      this.fileName.textContent = "";
      this.fileMeta.textContent = "";
      this.preview.hidden = true;
      this.emptyState.hidden = false;
      this.clearMessage();
      this.dropZone.focus();
    }

    handleAnalysis() {
      if (!this.selectedFile) {
        this.showMessage("اختر صورة عين صالحة أولًا.", "error");
        return;
      }

      this.showMessage(
        "تحليل AI غير متصل بعد. تم التحقق من الصورة والواجهة جاهزة للربط بالنموذج مستقبلًا.",
        "info"
      );
    }

    showMessage(text, type) {
      this.message.textContent = text;
      this.message.className = `upload-message upload-message--${type} is-visible`;
    }

    clearMessage() {
      this.message.textContent = "";
      this.message.className = "upload-message";
    }

    releaseObjectUrl() {
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = null;
      }
    }

    formatFileSize(bytes) {
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  }

  document.querySelectorAll("[data-examination-upload]").forEach((root) => {
    new ExaminationUpload(root);
  });
})();
