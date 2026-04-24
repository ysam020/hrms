import { renderHook, act } from "@testing-library/react";
import { useCurrentTime } from "@web/shared/hooks/useCurrentTime";

describe("useCurrentTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a Date object for currentTime", () => {
    const { result } = renderHook(() => useCurrentTime());
    expect(result.current.currentTime).toBeInstanceOf(Date);
  });

  it("returns a formatted time string from getCurrentTime", () => {
    const { result } = renderHook(() => useCurrentTime());
    const time = result.current.getCurrentTime();
    expect(typeof time).toBe("string");
    // Matches HH:MM or H:MM format
    expect(time).toMatch(/\d{1,2}:\d{2}/);
  });

  it("updates currentTime after one second", () => {
    const { result } = renderHook(() => useCurrentTime());
    const before = result.current.currentTime.getTime();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.currentTime.getTime()).toBeGreaterThan(before);
  });

  it("updates currentTime multiple times", () => {
    const { result } = renderHook(() => useCurrentTime());
    const before = result.current.currentTime.getTime();

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.currentTime.getTime()).toBe(before + 3000);
  });

  it("clears the interval on unmount", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const { unmount } = renderHook(() => useCurrentTime());
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it("does not update after unmount", () => {
    const { result, unmount } = renderHook(() => useCurrentTime());
    const timeAtUnmount = result.current.currentTime.getTime();
    unmount();

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // result.current is a snapshot; verify no state update happened post-unmount
    expect(result.current.currentTime.getTime()).toBe(timeAtUnmount);
  });
});
