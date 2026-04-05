/**
 * faceMathWasm.js
 *
 * Typed-JavaScript wrapper around the face_math.wasm binary.
 * Designed to be imported inside a Web Worker (no DOM access needed).
 *
 * The module shares a single WebAssembly.Memory instance.  All functions
 * allocate temporary regions inside that memory, call the C functions, and
 * free the regions before returning — callers never touch raw pointers.
 */

let _wasm: any = null; // WebAssembly.Instance

/**
 * Load and instantiate face_math.wasm.
 * Safe to call multiple times — returns the cached instance after the first.
 *
 * @param {string} [wasmUrl="/face_math.wasm"]
 */
export async function loadFaceMath(wasmUrl = "/face_math.wasm") {
  if (_wasm) return _wasm;

  const response = await fetch(wasmUrl);
  const buffer = await response.arrayBuffer();

  const { instance } = await WebAssembly.instantiate(buffer, {
    // face_math.wasm has no imports; the object below is empty.
  });

  _wasm = instance.exports;
  // HEAPF32 view is recreated on every call so it stays valid even if
  // the WASM memory grows (ALLOW_MEMORY_GROWTH – not used here, but safe).
  _getHeap = () => new Float32Array(_wasm.memory.buffer);

  return _wasm;
}

let _getHeap: any = null;

/**
 * Allocate n Float32 slots at the start of WASM memory starting at a given
 * page-aligned offset.  We use a simple bump-allocator beginning at byte 0
 * inside the single 64 KiB page (the WAT declares (memory 1)).
 *
 * Each call region is non-overlapping as long as they are released before the
 * next call — which all exported wrappers guarantee because they are sync.
 */
const REGION = {
  LM: { offset: 0, size: 136 * 4 }, // 68 landmarks × 2 floats
  OUT3: { offset: 136 * 4, size: 3 * 4 }, // 3-float result
  POSE: { offset: (136 + 3) * 4, size: 8 * 3 * 4 }, // up to 8 poses × 3 floats
  A: { offset: (136 + 3 + 24) * 4, size: 128 * 4 }, // descriptor A
  B: { offset: (136 + 3 + 24 + 128) * 4, size: 128 * 4 }, // descriptor B
};

/**
 * calculateHeadPose
 *
 * Compute horizontal, vertical, and roll angles (in degrees) from the 68-point
 * dlib facial landmark positions.
 *
 * @param  {Array<{x:number,y:number}>} landmarks  68-element array.
 * @returns {{ horizontal: number, vertical: number, roll: number }}
 */
export function calculateHeadPose(landmarks) {
  const heap = _getHeap();

  // Write landmarks into WASM memory [x0,y0, x1,y1, …]
  const lmBase = REGION.LM.offset / 4; // Float32Array index
  for (let i = 0; i < landmarks.length; i++) {
    heap[lmBase + i * 2] = landmarks[i].x;
    heap[lmBase + i * 2 + 1] = landmarks[i].y;
  }

  const outBase = REGION.OUT3.offset; // byte offset for WASM call

  _wasm.calculate_head_pose(REGION.LM.offset, outBase);

  const outIdx = outBase / 4;
  return {
    horizontal: heap[outIdx],
    vertical: heap[outIdx + 1],
    roll: heap[outIdx + 2],
  };
}

/**
 * euclideanDistance
 *
 * Compute the L2 distance between two face descriptors entirely in WASM.
 *
 * @param  {Float32Array|number[]} d1
 * @param  {Float32Array|number[]} d2
 * @returns {number}
 */
export function euclideanDistance(d1, d2) {
  const n = d1.length;
  const heap = _getHeap();

  const aBase = REGION.A.offset / 4;
  const bBase = REGION.B.offset / 4;

  for (let i = 0; i < n; i++) {
    heap[aBase + i] = d1[i];
    heap[bBase + i] = d2[i];
  }

  return _wasm.euclidean_distance(REGION.A.offset, REGION.B.offset, n);
}

/**
 * maxHeadMovement
 *
 * Returns the maximum frame-to-frame Euclidean displacement across a sequence
 * of head-pose triples [{horizontal, vertical, roll}].
 *
 * @param  {Array<{horizontal:number,vertical:number,roll:number}>} poses
 * @returns {number}
 */
export function maxHeadMovement(poses) {
  const heap = _getHeap();
  const pBase = REGION.POSE.offset / 4;

  for (let i = 0; i < poses.length; i++) {
    heap[pBase + i * 3] = poses[i].horizontal;
    heap[pBase + i * 3 + 1] = poses[i].vertical;
    heap[pBase + i * 3 + 2] = poses[i].roll;
  }

  return _wasm.max_head_movement(REGION.POSE.offset, poses.length);
}
