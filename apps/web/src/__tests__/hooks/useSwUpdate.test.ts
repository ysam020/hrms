import { renderHook, act } from "@testing-library/react";
import { useSwUpdate } from "@web/shared/hooks/useSwUpdate";

const makeRegistration = () => ({
  waiting: { postMessage: vi.fn() },
});

describe("useSwUpdate", () => {
  it("starts with updateAvailable=false", () => {
    const { result } = renderHook(() => useSwUpdate());
    expect(result.current.updateAvailable).toBe(false);
  });

  it("sets updateAvailable=true when sw-update-available event fires", () => {
    const { result } = renderHook(() => useSwUpdate());
    const reg = makeRegistration();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sw-update-available", { detail: reg }),
      );
    });

    expect(result.current.updateAvailable).toBe(true);
  });

  it("calls waiting.postMessage with SKIP_WAITING on triggerUpdate", () => {
    const reg = makeRegistration();
    const { result } = renderHook(() => useSwUpdate());

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sw-update-available", { detail: reg }),
      );
    });

    act(() => {
      result.current.triggerUpdate();
    });

    expect(reg.waiting.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });
  });

  it("sets updateAvailable back to false after triggerUpdate", () => {
    const reg = makeRegistration();
    const { result } = renderHook(() => useSwUpdate());

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sw-update-available", { detail: reg }),
      );
    });
    expect(result.current.updateAvailable).toBe(true);

    act(() => {
      result.current.triggerUpdate();
    });
    expect(result.current.updateAvailable).toBe(false);
  });

  it("triggerUpdate is a no-op when no update is available", () => {
    const { result } = renderHook(() => useSwUpdate());
    expect(() => {
      act(() => {
        result.current.triggerUpdate();
      });
    }).not.toThrow();
    expect(result.current.updateAvailable).toBe(false);
  });

  it("responds to multiple sw-update-available events (last one wins)", () => {
    const reg1 = makeRegistration();
    const reg2 = makeRegistration();
    const { result } = renderHook(() => useSwUpdate());

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sw-update-available", { detail: reg1 }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new CustomEvent("sw-update-available", { detail: reg2 }),
      );
    });

    act(() => {
      result.current.triggerUpdate();
    });

    expect(reg2.waiting.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });
    expect(reg1.waiting.postMessage).not.toHaveBeenCalled();
  });

  it("removes the event listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useSwUpdate());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith(
      "sw-update-available",
      expect.any(Function),
    );
  });

  it("does not update state after unmount", () => {
    const reg = makeRegistration();
    const { result, unmount } = renderHook(() => useSwUpdate());
    unmount();

    act(() => {
      window.dispatchEvent(
        new CustomEvent("sw-update-available", { detail: reg }),
      );
    });

    expect(result.current.updateAvailable).toBe(false);
  });
});
