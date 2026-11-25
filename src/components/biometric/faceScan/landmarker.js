/**
 * Nạp MediaPipe Face Landmarker một lần (singleton). WASM từ CDN jsdelivr, model từ
 * storage.googleapis (xem MEDIAPIPE trong config.js). Gọi sớm ở bước đồng ý để vào màn
 * quét là sẵn sàng.
 */
import { MEDIAPIPE } from "./config";

let promise = null;
let delegateUsed = null;

export function landmarkerDelegate() {
  return delegateUsed;
}

export function loadLandmarker() {
  if (promise) return promise;
  promise = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE.wasmPath);
    const make = (delegate) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MEDIAPIPE.modelPath, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
      });
    try {
      const lm = await make("GPU");
      delegateUsed = "GPU";
      return lm;
    } catch {
      const lm = await make("CPU");
      delegateUsed = "CPU";
      return lm;
    }
  })().catch((e) => {
    promise = null;
    throw e;
  });
  return promise;
}
