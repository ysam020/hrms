import { renderHook, act } from "@testing-library/react";
import useSpotlightModal from "@web/shared/hooks/useSpotlightModal";

function fireShortcut() {
  const event = new KeyboardEvent("keydown", { shiftKey: true, key: " " });
  window.dispatchEvent(event);
}

describe("useSpotlightModal", () => {
  it("opens on Shift+Space when a user is present, and closes via handleClose", () => {
    const { result } = renderHook(() => useSpotlightModal({ id: "u1" }));
    expect(result.current.open).toBe(false);

    act(() => fireShortcut());
    expect(result.current.open).toBe(true);

    act(() => result.current.handleClose());
    expect(result.current.open).toBe(false);
  });

  it("does not open the shortcut when there is no user", () => {
    const { result } = renderHook(() => useSpotlightModal(null));

    act(() => fireShortcut());
    expect(result.current.open).toBe(false);
  });

  it("removes the keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useSpotlightModal({ id: "u1" }));

    unmount();

    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("re-registers the listener with the latest user when it changes", () => {
    const { result, rerender } = renderHook(
      ({ user }) => useSpotlightModal(user),
      {
        initialProps: { user: null as any },
      },
    );

    act(() => fireShortcut());
    expect(result.current.open).toBe(false);

    rerender({ user: { id: "u2" } });
    act(() => fireShortcut());
    expect(result.current.open).toBe(true);
  });
});
