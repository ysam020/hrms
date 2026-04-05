import {
  loadFaceMath,
  calculateHeadPose,
  euclideanDistance,
  maxHeadMovement,
} from "@web/core/wasm/faceMathWasm";

const HEAD_MOVEMENT_SAMPLES = 8;
const MOVEMENT_THRESHOLD = 12;
const MAX_CONSECUTIVE_FAILURES = 10;
const MIN_CONFIDENCE = 0.5;
const MAX_DETECTION_TIME = 15000;

let headPositions: any[] = [];
let consecutiveFailures = 0;
let done = false;

// Initialise WASM eagerly so the first frame is not delayed
let wasmReady = false;
loadFaceMath()
  .then(() => {
    wasmReady = true;
  })
  .catch((err) =>
    console.error("[faceRecognition.worker] WASM load failed:", err),
  );

// ── Synchronous JS fallback (used only if WASM hasn't loaded yet) ─────────────

const jsFallback = {
  calculateHeadPose(landmarks) {
    const noseTip = landmarks[30];
    const leftEye = landmarks[36];
    const rightEye = landmarks[45];
    const chin = landmarks[8];
    if (!noseTip || !leftEye || !rightEye || !chin) return null;
    const cx = (leftEye.x + rightEye.x) / 2;
    const cy = (leftEye.y + rightEye.y) / 2;
    const R2D = 180 / Math.PI;
    return {
      horizontal:
        Math.atan2(noseTip.x - cx, Math.abs(noseTip.y - cy) + 1) * R2D,
      vertical: Math.atan2(chin.y - cy, Math.abs(chin.x - cx) + 1) * R2D,
      roll: Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * R2D,
    };
  },

  maxHeadMovement(poses) {
    let mx = 0;
    for (let i = 1; i < poses.length; i++) {
      const p = poses[i - 1],
        c = poses[i];
      const dH = Math.abs(c.horizontal - p.horizontal);
      const dV = Math.abs(c.vertical - p.vertical);
      const dR = Math.abs(c.roll - p.roll);
      const m = Math.sqrt(dH * dH + dV * dV + dR * dR);
      if (m > mx) mx = m;
    }
    return mx;
  },

  euclideanDistance(d1, d2) {
    let sum = 0;
    for (let i = 0; i < d1.length; i++) {
      const d = d1[i] - d2[i];
      sum += d * d;
    }
    return Math.sqrt(sum);
  },
};

// Pick WASM or JS-fallback transparently
const math = {
  pose: (lm) =>
    wasmReady ? calculateHeadPose(lm) : jsFallback.calculateHeadPose(lm),
  movement: (poses) =>
    wasmReady ? maxHeadMovement(poses) : jsFallback.maxHeadMovement(poses),
  distance: (d1, d2) =>
    wasmReady
      ? euclideanDistance(d1, d2)
      : jsFallback.euclideanDistance(d1, d2),
};

// ── Message handler ───────────────────────────────────────────────────────────

self.onmessage = ({ data }) => {
  const { type } = data;

  if (type === "init_liveness") {
    headPositions = [];
    consecutiveFailures = 0;
    done = false;
    return;
  }

  if (type === "frame_result") {
    if (done) return;

    const { detected, landmarks, elapsed, score } = data;

    if (!detected) {
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        done = true;
        self.postMessage({
          type: "liveness_error",
          error:
            "Face not consistently detected. Please ensure your face is clearly visible and well-lit.",
        });
      }
      return;
    }

    consecutiveFailures = 0;
    if (score < MIN_CONFIDENCE) return;

    // ── WASM: head pose from raw landmark positions ─────────────────────────
    const headPose = math.pose(landmarks);
    if (!headPose) return;

    headPositions.push(headPose);
    if (headPositions.length > HEAD_MOVEMENT_SAMPLES) headPositions.shift();

    // ── WASM: max movement across the sliding window ────────────────────────
    let currentMax = 0;
    if (headPositions.length >= 3) {
      currentMax = math.movement(headPositions);
    }

    const movementProgress = Math.min(currentMax / MOVEMENT_THRESHOLD, 1) * 100;
    const timeProgress =
      Math.min(elapsed / (MAX_DETECTION_TIME * 0.7), 1) * 100;
    const combinedProgress = Math.max(movementProgress, timeProgress * 0.3);
    const headMovementDetected = currentMax > MOVEMENT_THRESHOLD;

    self.postMessage({
      type: "progress",
      progress: combinedProgress,
      headMovementDetected,
    });

    if (headMovementDetected) {
      done = true;
      self.postMessage({ type: "liveness_done" });
    }
    return;
  }

  if (type === "compute_distance") {
    // ── WASM: euclidean distance between 128-float face descriptors ──────────
    const distance = math.distance(data.d1, data.d2);
    self.postMessage({ type: "distance_result", distance });
  }
};
