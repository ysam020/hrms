import { renderHook } from "@testing-library/react";
import { useVideoCallback } from "@web/shared/hooks/useVideoCallback";

function makeStream(stopSpy = vi.fn()) {
  return { getTracks: () => [{ stop: stopSpy }] } as any;
}

describe("useVideoCallback", () => {
  it("attaches the video stream to the node and plays it", () => {
    const stream = makeStream();
    const play = vi.fn().mockResolvedValue(undefined);
    const node: any = { play };
    const videoStreamRef = { current: null } as any;

    const { result } = renderHook(() =>
      useVideoCallback({ videoStream: stream }, videoStreamRef),
    );

    result.current.videoCallbackRef(node);

    expect(node.srcObject).toBe(stream);
    expect(videoStreamRef.current).toBe(stream);
    expect(play).toHaveBeenCalled();
  });

  it("does nothing when there is no node or no active stream", () => {
    const videoStreamRef = { current: null } as any;
    const { result } = renderHook(() =>
      useVideoCallback({ videoStream: null }, videoStreamRef),
    );

    result.current.videoCallbackRef({ play: vi.fn() } as any);
    expect(videoStreamRef.current).toBeNull();

    result.current.videoCallbackRef(null);
    expect(videoStreamRef.current).toBeNull();
  });

  it("logs but does not throw when play() rejects", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const stream = makeStream();
    const play = vi.fn().mockRejectedValue(new Error("autoplay blocked"));
    const node: any = { play };
    const videoStreamRef = { current: null } as any;

    const { result } = renderHook(() =>
      useVideoCallback({ videoStream: stream }, videoStreamRef),
    );
    result.current.videoCallbackRef(node);

    await vi.waitFor(() =>
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error playing video:",
        expect.any(Error),
      ),
    );
    consoleSpy.mockRestore();
  });

  it("stops all tracks and clears the ref on unmount", () => {
    const stopSpy = vi.fn();
    const stream = makeStream(stopSpy);
    const videoStreamRef = { current: stream } as any;

    const { unmount } = renderHook(() =>
      useVideoCallback({ videoStream: stream }, videoStreamRef),
    );

    unmount();

    expect(stopSpy).toHaveBeenCalled();
    expect(videoStreamRef.current).toBeNull();
  });

  it("does nothing on unmount when there was no active stream", () => {
    const videoStreamRef = { current: null } as any;
    const { unmount } = renderHook(() =>
      useVideoCallback({ videoStream: null }, videoStreamRef),
    );
    expect(() => unmount()).not.toThrow();
  });
});
