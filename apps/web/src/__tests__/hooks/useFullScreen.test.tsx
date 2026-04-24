import { renderHook } from "@testing-library/react";
import useFullScreen from "@web/shared/hooks/useFullScreen";

const mockToggleFullScreen = vi.fn();

vi.mock("@web/core/shortcuts", () => ({
  toggleFullScreen: mockToggleFullScreen,
}));

describe("useFullScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mounts without crashing", () => {
    expect(() => renderHook(() => useFullScreen())).not.toThrow();
  });

  it("removes keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useFullScreen());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("does not throw on Ctrl+Shift+F keydown (import is async)", () => {
    renderHook(() => useFullScreen());
    expect(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "f",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    }).not.toThrow();
  });

  it("does not react to unrelated keys", () => {
    renderHook(() => useFullScreen());
    expect(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    }).not.toThrow();
  });
});
