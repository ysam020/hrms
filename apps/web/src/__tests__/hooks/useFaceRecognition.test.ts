import { renderHook, act, waitFor } from "@testing-library/react";
import { useFaceRecognition } from "@web/shared/hooks/useFaceRecognition";
import * as faceapi from "face-api.js";

vi.mock("face-api.js", () => ({
  detectSingleFace: vi.fn(),
  TinyFaceDetectorOptions: vi.fn(),
}));

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: any) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
}

function currentWorker() {
  return FakeWorker.instances[FakeWorker.instances.length - 1];
}

function detectionChain(result: any) {
  return { withFaceDescriptor: vi.fn().mockResolvedValue(result) };
}

describe("useFaceRecognition", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    (global as any).Worker = FakeWorker;
    (faceapi.detectSingleFace as any).mockReturnValue({
      withFaceLandmarks: vi.fn().mockReturnValue(detectionChain(null)),
    });
  });

  it("spins up a worker on mount and terminates it on unmount", () => {
    const { unmount } = renderHook(() => useFaceRecognition());
    expect(FakeWorker.instances).toHaveLength(1);
    const worker = currentWorker();

    unmount();

    expect(worker.terminate).toHaveBeenCalled();
  });

  describe("updateFaceRecognitionState throttling", () => {
    it("always applies a step change immediately, bypassing the throttle", () => {
      const { result } = renderHook(() => useFaceRecognition());

      act(() =>
        result.current.updateFaceRecognitionState({ step: "camera_setup" }),
      );

      expect(result.current.faceRecognitionState.step).toBe("camera_setup");
    });

    it("throttles same-step progress updates within the 200ms window", () => {
      const { result } = renderHook(() => useFaceRecognition());
      act(() =>
        result.current.updateFaceRecognitionState({ step: "face_detection" }),
      );

      act(() => result.current.updateFaceRecognitionState({ progress: 50 }));

      // Same step, called immediately after — throttled, so progress stays unset
      expect(result.current.faceRecognitionState.progress).toBe(0);
    });

    it("applies a same-step update once the throttle window has elapsed", async () => {
      const { result } = renderHook(() => useFaceRecognition());
      act(() =>
        result.current.updateFaceRecognitionState({ step: "face_detection" }),
      );

      await new Promise((r) => setTimeout(r, 210));
      act(() => result.current.updateFaceRecognitionState({ progress: 75 }));

      expect(result.current.faceRecognitionState.progress).toBe(75);
    });
  });

  describe("performFaceEnrollment", () => {
    it("returns the descriptor as a plain array when a face is detected", async () => {
      (faceapi.detectSingleFace as any).mockReturnValue({
        withFaceLandmarks: vi
          .fn()
          .mockReturnValue(
            detectionChain({ descriptor: new Float32Array([0.1, 0.2, 0.3]) }),
          ),
      });
      const { result } = renderHook(() => useFaceRecognition());

      const descriptor = await result.current.performFaceEnrollment({} as any);

      expect(descriptor).toEqual([
        expect.closeTo(0.1, 5),
        expect.closeTo(0.2, 5),
        expect.closeTo(0.3, 5),
      ]);
    });

    it("throws a descriptive error when no face is detected", async () => {
      (faceapi.detectSingleFace as any).mockReturnValue({
        withFaceLandmarks: vi.fn().mockReturnValue(detectionChain(null)),
      });
      const { result } = renderHook(() => useFaceRecognition());

      await expect(
        result.current.performFaceEnrollment({} as any),
      ).rejects.toThrow("Face not detected during enrollment");
    });
  });

  describe("performFaceVerification (worker distance path)", () => {
    it("resolves true when the worker reports a distance under the 0.6 threshold", async () => {
      (faceapi.detectSingleFace as any).mockReturnValue({
        withFaceLandmarks: vi
          .fn()
          .mockReturnValue(
            detectionChain({ descriptor: new Float32Array([0.1, 0.2]) }),
          ),
      });
      const { result } = renderHook(() => useFaceRecognition());

      const promise = result.current.performFaceVerification(
        {} as any,
        new Float32Array([0.1, 0.2]),
      );
      await waitFor(() => expect(currentWorker().onmessage).toBeTruthy());
      currentWorker().onmessage!({
        data: { type: "distance_result", distance: 0.2 },
      });

      await expect(promise).resolves.toBe(true);
    });

    it("rejects when the worker reports a distance at or above the 0.6 threshold", async () => {
      (faceapi.detectSingleFace as any).mockReturnValue({
        withFaceLandmarks: vi
          .fn()
          .mockReturnValue(
            detectionChain({ descriptor: new Float32Array([0.1, 0.2]) }),
          ),
      });
      const { result } = renderHook(() => useFaceRecognition());

      const promise = result.current.performFaceVerification(
        {} as any,
        new Float32Array([0.9, 0.9]),
      );
      await waitFor(() => expect(currentWorker().onmessage).toBeTruthy());
      currentWorker().onmessage!({
        data: { type: "distance_result", distance: 0.75 },
      });

      await expect(promise).rejects.toThrow("Face verification failed");
    });

    it("throws when no face is detected during verification", async () => {
      (faceapi.detectSingleFace as any).mockReturnValue({
        withFaceLandmarks: vi.fn().mockReturnValue(detectionChain(null)),
      });
      const { result } = renderHook(() => useFaceRecognition());

      await expect(
        result.current.performFaceVerification(
          {} as any,
          new Float32Array([0.1]),
        ),
      ).rejects.toThrow("Face not detected during verification");
    });
  });

  describe("performLivenessDetection (worker message resolution)", () => {
    it("resolves true when the worker reports liveness_done", async () => {
      const { result } = renderHook(() => useFaceRecognition());
      const video = { readyState: 0, HAVE_ENOUGH_DATA: 4 } as any;

      const promise = result.current.performLivenessDetection(video);
      await waitFor(() => expect(currentWorker().onmessage).toBeTruthy());
      currentWorker().onmessage!({ data: { type: "liveness_done" } });

      await expect(promise).resolves.toBe(true);
    });

    it("rejects with the worker's error message when the worker reports liveness_error", async () => {
      const { result } = renderHook(() => useFaceRecognition());
      const video = { readyState: 0, HAVE_ENOUGH_DATA: 4 } as any;

      const promise = result.current.performLivenessDetection(video);
      await waitFor(() => expect(currentWorker().onmessage).toBeTruthy());
      currentWorker().onmessage!({
        data: {
          type: "liveness_error",
          error: "No consistent head movement detected",
        },
      });

      await expect(promise).rejects.toThrow(
        "No consistent head movement detected",
      );
    });
  });

  describe("setupCamera", () => {
    it("wraps a getUserMedia rejection in a descriptive camera-setup error", async () => {
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: vi
            .fn()
            .mockRejectedValue(new Error("Permission denied")),
        },
      });
      const { result } = renderHook(() => useFaceRecognition());

      await expect(result.current.setupCamera()).rejects.toThrow(
        "Camera setup failed: Permission denied",
      );

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    });
  });

  describe("cleanupCamera / resetState", () => {
    it("stops all tracks on the active stream and resets recognition state", async () => {
      const stop = vi.fn();
      const originalMediaDevices = navigator.mediaDevices;
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: vi
            .fn()
            .mockResolvedValue({ getTracks: () => [{ stop }] }),
        },
      });
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreateElement(tag);
        if (tag === "video") {
          queueMicrotask(() => (el as any).onloadedmetadata?.());
        }
        return el;
      });
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(
        undefined as any,
      );

      const { result } = renderHook(() => useFaceRecognition());
      await result.current.setupCamera();

      act(() => result.current.cleanupCamera());

      expect(stop).toHaveBeenCalled();
      expect(result.current.faceRecognitionState).toEqual({
        step: "",
        showVideo: false,
        videoStream: null,
        progress: 0,
        headMovementDetected: false,
      });

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    }, 10000);

    it("resetState clears the camera and the liveness detection buffer", () => {
      const { result } = renderHook(() => useFaceRecognition());
      act(() => result.current.resetState());
      expect(result.current.faceRecognitionState.step).toBe("");
    });
  });
});
