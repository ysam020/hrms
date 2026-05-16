import { useState, useRef, useCallback, useEffect } from "react";

export const useFaceRecognition = () => {
  const [faceRecognitionState, setFaceRecognitionState] = useState({
    step: "",
    showVideo: false,
    videoStream: null,
    progress: 0,
    headMovementDetected: false,
  });

  const livenessDataRef = useRef<{
    headPositions: any[];
    frameCount: number;
    lastUpdateTime: number;
    detectionHistory: any[];
    startTime?: number;
  }>({
    headPositions: [],
    frameCount: 0,
    lastUpdateTime: 0,
    detectionHistory: [],
  });

  const videoStreamRef = useRef<MediaStream | null>(null);

  // Worker for head-pose math, movement analysis, and euclidean distance
  const workerRef = useRef<Worker | null>(null);

  const UPDATE_THROTTLE = 200;
  const MAX_DETECTION_TIME = 15000;

  // Spin up the worker once on mount
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../core/workers/faceRecognition.worker.ts", import.meta.url),
    );
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const updateFaceRecognitionState = useCallback(
    (newState) => {
      const now = Date.now();

      if (newState.step && newState.step !== faceRecognitionState.step) {
        setFaceRecognitionState((prev) => ({ ...prev, ...newState }));
        livenessDataRef.current.lastUpdateTime = now;
        return;
      }

      if (now - livenessDataRef.current.lastUpdateTime > UPDATE_THROTTLE) {
        setFaceRecognitionState((prev) => ({ ...prev, ...newState }));
        livenessDataRef.current.lastUpdateTime = now;
      }
    },
    [faceRecognitionState.step],
  );

  /**
   * Liveness detection
   *
   * The main thread runs face-api.js inference (GPU via WebGL) and sends the
   * raw landmark positions to the worker for head-pose and movement maths.
   * This keeps the React render loop free of the heavy floating-point work.
   */
  const performLivenessDetection = useCallback(
    async (video) => {
      const faceapi = await import("face-api.js");

      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          reject(new Error("Face recognition worker not available"));
          return;
        }

        // Reset state in the worker
        worker.postMessage({ type: "init_liveness" });

        livenessDataRef.current = {
          headPositions: [],
          frameCount: 0,
          lastUpdateTime: 0,
          detectionHistory: [],
          startTime: Date.now(),
        };

        let settled = false;

        const settle = (fn) => {
          if (settled) return;
          settled = true;
          clearInterval(detectionInterval);
          worker.onmessage = null;
          fn();
        };

        // Worker sends back progress updates, done, or error
        worker.onmessage = ({ data }) => {
          if (data.type === "progress") {
            updateFaceRecognitionState({
              headMovementDetected: data.headMovementDetected,
              progress: data.progress,
            });
          } else if (data.type === "liveness_done") {
            settle(() => resolve(true));
          } else if (data.type === "liveness_error") {
            settle(() => reject(new Error(data.error)));
          }
        };

        const detectionInterval = setInterval(async () => {
          try {
            const elapsedTime =
              Date.now() - (livenessDataRef.current.startTime ?? 0);

            if (elapsedTime > MAX_DETECTION_TIME) {
              settle(() =>
                reject(
                  new Error(
                    "Liveness detection timeout. Please ensure good lighting and try again.",
                  ),
                ),
              );
              return;
            }

            if (video.readyState !== video.HAVE_ENOUGH_DATA) return;

            const detection = await faceapi
              .detectSingleFace(
                video,
                new faceapi.TinyFaceDetectorOptions({
                  inputSize: 416,
                  scoreThreshold: 0.5,
                }),
              )
              .withFaceLandmarks();

            // Send result to worker — transfer plain landmark positions (no
            // face-api objects, which are not serialisable)
            if (!detection) {
              worker.postMessage({
                type: "frame_result",
                detected: false,
                elapsed: elapsedTime,
              });
            } else {
              const positions = detection.landmarks.positions.map((p) => ({
                x: p.x,
                y: p.y,
              }));
              worker.postMessage({
                type: "frame_result",
                detected: true,
                landmarks: positions,
                score: detection.detection.score,
                elapsed: elapsedTime,
              });
            }
          } catch (error) {
            console.error("Liveness detection frame error:", error);
          }
        }, 150);

        setTimeout(() => {
          settle(() =>
            reject(
              new Error(
                "Liveness detection timeout. Please ensure good lighting and try again.",
              ),
            ),
          );
        }, MAX_DETECTION_TIME + 1000);
      });
    },
    [updateFaceRecognitionState],
  );

  /**
   * Face verification
   *
   * The main thread runs the face descriptor extraction (TF.js / WebGL), then
   * sends both descriptors to the worker for the euclidean distance calculation.
   */
  const performFaceVerification = useCallback(
    async (video, storedDescriptor) => {
      const faceapi = await import("face-api.js");

      const detection = await faceapi
        .detectSingleFace(
          video,
          new faceapi.TinyFaceDetectorOptions({
            inputSize: 512,
            scoreThreshold: 0.5,
          }),
        )
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection || !detection.descriptor) {
        throw new Error(
          "Face not detected during verification. Please ensure your face is clearly visible and try again.",
        );
      }

      // Compute distance in the worker (off main thread)
      return new Promise((resolve, reject) => {
        const worker = workerRef.current;
        if (!worker) {
          // Fallback: compute on main thread
          const d1 = storedDescriptor;
          const d2 = detection.descriptor;
          let sum = 0;
          for (let i = 0; i < d1.length; i++) {
            const diff = d1[i] - d2[i];
            sum += diff * diff;
          }
          const distance = Math.sqrt(sum);
          if (distance > 0.6) {
            reject(
              new Error(
                `Face verification failed. Distance: ${distance.toFixed(3)} (required: < 0.6)`,
              ),
            );
          } else {
            resolve(true);
          }
          return;
        }

        const prevOnMessage = worker.onmessage;
        worker.onmessage = ({ data }) => {
          if (data.type === "distance_result") {
            // Restore previous handler (liveness may have set one)
            worker.onmessage = prevOnMessage;
            const { distance } = data;
            if (distance > 0.6) {
              reject(
                new Error(
                  `Face verification failed. Distance: ${distance.toFixed(3)} (required: < 0.6)`,
                ),
              );
            } else {
              resolve(true);
            }
          } else if (prevOnMessage) {
            prevOnMessage.call(worker, { data } as MessageEvent);
          }
        };

        worker.postMessage({
          type: "compute_distance",
          d1: Array.from(storedDescriptor),
          d2: Array.from(detection.descriptor),
        });
      });
    },
    [],
  );

  /**
   * Face enrollment
   *
   * Extracts a 128-D face descriptor from the video and returns it as a plain
   * number array suitable for JSON serialisation and DB storage.
   */
  const performFaceEnrollment = useCallback(async (video) => {
    const faceapi = await import("face-api.js");

    const detection = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({
          inputSize: 512,
          scoreThreshold: 0.5,
        }),
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection || !detection.descriptor) {
      throw new Error(
        "Face not detected during enrollment. Please ensure your face is clearly visible and try again.",
      );
    }

    return Array.from(detection.descriptor);
  }, []);

  const setupCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, min: 480 },
          height: { ideal: 480, min: 360 },
          facingMode: "user",
          frameRate: { ideal: 30, min: 15 },
        },
      });

      const video = document.createElement("video");
      video.srcObject = stream;
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
      video.setAttribute("playsinline", "true");

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = reject;
        setTimeout(() => reject(new Error("Video loading timeout")), 10000);
      });

      await video.play();
      await new Promise((resolve) => setTimeout(resolve, 1500));

      videoStreamRef.current = stream;
      return { stream, video };
    } catch (error) {
      console.error("Camera setup error:", error);
      throw new Error(`Camera setup failed: ${error.message}`);
    }
  }, []);

  const cleanupCamera = useCallback(() => {
    if (videoStreamRef.current) {
      videoStreamRef.current.getTracks().forEach((track) => track.stop());
      videoStreamRef.current = null;
    }
    setFaceRecognitionState({
      step: "",
      showVideo: false,
      videoStream: null,
      progress: 0,
      headMovementDetected: false,
    });
  }, []);

  const resetState = useCallback(() => {
    cleanupCamera();
    livenessDataRef.current = {
      headPositions: [],
      frameCount: 0,
      lastUpdateTime: 0,
      detectionHistory: [],
    };
  }, [cleanupCamera]);

  return {
    faceRecognitionState,
    updateFaceRecognitionState,
    performLivenessDetection,
    performFaceVerification,
    performFaceEnrollment,
    setupCamera,
    cleanupCamera,
    resetState,
    videoStreamRef,
  };
};
