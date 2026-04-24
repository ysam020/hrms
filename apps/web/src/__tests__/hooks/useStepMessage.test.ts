import { renderHook } from "@testing-library/react";
import { useStepMessage } from "@web/shared/hooks/useStepMessage";

describe("useStepMessage", () => {
  it("returns correct message for camera_access", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: "camera_access" })).toBe(
      "Requesting camera access...",
    );
  });

  it("returns correct message for camera_setup", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: "camera_setup" })).toBe(
      "Setting up camera...",
    );
  });

  it("returns correct message for face_detection", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: "face_detection" })).toBe(
      "Detecting face...",
    );
  });

  it("returns correct message for liveness_instruction", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(
      result.current.getStepMessage({ step: "liveness_instruction" }),
    ).toBe("Please follow the instructions to verify you're a real person");
  });

  it("returns correct message for liveness_head_movement", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(
      result.current.getStepMessage({ step: "liveness_head_movement" }),
    ).toBe("Slowly turn your head left and right");
  });

  it("returns correct message for face_analysis", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: "face_analysis" })).toBe(
      "Analyzing facial features...",
    );
  });

  it("returns correct message for face_matching", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: "face_matching" })).toBe(
      "Matching with stored face data...",
    );
  });

  it("returns correct message for location_access", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: "location_access" })).toBe(
      "Getting location...",
    );
  });

  it("returns correct message for recording_attendance", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(
      result.current.getStepMessage({ step: "recording_attendance" }),
    ).toBe("Recording attendance...");
  });

  it("returns 'Processing...' for unknown step", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: "unknown_step" })).toBe(
      "Processing...",
    );
  });

  it("returns 'Processing...' when step is undefined", () => {
    const { result } = renderHook(() => useStepMessage());
    expect(result.current.getStepMessage({ step: undefined })).toBe(
      "Processing...",
    );
  });

  it("returns a stable getStepMessage reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useStepMessage());
    const fn1 = result.current.getStepMessage;
    rerender();
    expect(result.current.getStepMessage).toBe(fn1);
  });
});
