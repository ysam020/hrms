import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import useNavigateWithKeyboard from "@web/shared/hooks/useNavigateWithKeyboard";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };
const mockNavigateWithKeyboard = vi.fn();

vi.mock("@web/shared/utils/navigateWithKeyboard", () => ({
  navigateWithKeyboard: (...args: any[]) => mockNavigateWithKeyboard(...args),
}));

const wrapper = ({ children }: any) => (
  <MemoryRouter future={routerFuture}>{children}</MemoryRouter>
);

describe("useNavigateWithKeyboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mounts without crashing", () => {
    expect(() =>
      renderHook(() => useNavigateWithKeyboard(), { wrapper }),
    ).not.toThrow();
  });

  it("calls navigateWithKeyboard when a keydown event fires", () => {
    renderHook(() => useNavigateWithKeyboard(), { wrapper });

    const event = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(mockNavigateWithKeyboard).toHaveBeenCalledWith(
      event,
      expect.any(Function),
    );
  });

  it("passes navigate function as second argument", () => {
    renderHook(() => useNavigateWithKeyboard(), { wrapper });

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));

    const [, navigateFn] = mockNavigateWithKeyboard.mock.calls[0];
    expect(typeof navigateFn).toBe("function");
  });

  it("removes keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useNavigateWithKeyboard(), {
      wrapper,
    });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("does not call navigateWithKeyboard after unmount", () => {
    const { unmount } = renderHook(() => useNavigateWithKeyboard(), {
      wrapper,
    });
    unmount();
    mockNavigateWithKeyboard.mockClear();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1" }));
    expect(mockNavigateWithKeyboard).not.toHaveBeenCalled();
  });
});
