window.EyeCareFaceLandmarker = (() => {
  "use strict";
  const VERSION = "1.1.0";
  const MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/+esm`;
  const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
  let modulePromise = null;
  let visionPromise = null;

  function getVision() {
    modulePromise ||= import(MODULE_URL);
    visionPromise ||= modulePromise.then((tasks) => tasks.FilesetResolver.forVisionTasks(WASM_URL).then((vision) => ({ tasks, vision })));
    return visionPromise;
  }

  async function create() {
    const { tasks, vision } = await getVision();
    const options = (delegate) => ({ baseOptions: { modelAssetPath: MODEL_URL, delegate }, runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: false, outputFacialTransformationMatrixes: false, minFaceDetectionConfidence: 0.55, minFacePresenceConfidence: 0.55, minTrackingConfidence: 0.55 });
    try { return { landmarker: await tasks.FaceLandmarker.createFromOptions(vision, options("GPU")), delegate: "GPU" }; }
    catch (gpuError) { return { landmarker: await tasks.FaceLandmarker.createFromOptions(vision, options("CPU")), delegate: "CPU" }; }
  }

  return Object.freeze({ create, version: VERSION });
})();
