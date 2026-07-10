import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockApiClient = vi.fn();
const mockCancelAllPendingRequests = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: (...args: any[]) => mockApiClient(...args),
  cancelAllPendingRequests: (...args: any[]) =>
    mockCancelAllPendingRequests(...args),
}));

vi.mock("@web/shared/constants", () => ({
  API_ENDPOINTS: { LOGOUT: "/logout" },
}));

import useLogout from "@web/shared/hooks/useLogout";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };
const wrapper = ({ children }: any) => (
  <MemoryRouter future={routerFuture}>{children}</MemoryRouter>
);

describe("useLogout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("theme", JSON.stringify("dark"));
    localStorage.setItem("someOtherKey", "someValue");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns handleLogout, confirmOpen, cancelLogout, confirmLogout, loggingOut", () => {
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });
    expect(typeof result.current.handleLogout).toBe("function");
    expect(typeof result.current.cancelLogout).toBe("function");
    expect(typeof result.current.confirmLogout).toBe("function");
    expect(result.current.confirmOpen).toBe(false);
    expect(result.current.loggingOut).toBe(false);
  });

  it("handleLogout only opens the confirmation dialog, without logging out", () => {
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    act(() => {
      result.current.handleLogout();
    });

    expect(result.current.confirmOpen).toBe(true);
    expect(setUser).not.toHaveBeenCalled();
    expect(mockApiClient).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("cancelLogout closes the dialog without logging out", () => {
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    act(() => {
      result.current.handleLogout();
    });
    expect(result.current.confirmOpen).toBe(true);

    act(() => {
      result.current.cancelLogout();
    });

    expect(result.current.confirmOpen).toBe(false);
    expect(setUser).not.toHaveBeenCalled();
  });

  it("confirmLogout calls setUser(null) and navigates to /login on success", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      await result.current.confirmLogout();
    });

    expect(setUser).toHaveBeenCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    expect(result.current.confirmOpen).toBe(false);
  });

  it("calls cancelAllPendingRequests on successful logout", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.confirmLogout();
    });

    expect(mockCancelAllPendingRequests).toHaveBeenCalledWith("logout");
  });

  it("preserves theme in localStorage after logout", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.confirmLogout();
    });

    expect(localStorage.getItem("theme")).toBe(JSON.stringify("dark"));
  });

  it("clears non-theme keys from localStorage after logout", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.confirmLogout();
    });

    expect(localStorage.getItem("someOtherKey")).toBeNull();
  });

  it("still logs out when the API call fails", async () => {
    mockApiClient.mockRejectedValue(new Error("Network error"));
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      await result.current.confirmLogout();
    });

    expect(setUser).toHaveBeenCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("preserves theme even when API call fails", async () => {
    mockApiClient.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current.confirmLogout();
    });

    expect(localStorage.getItem("theme")).toBe(JSON.stringify("dark"));
  });

  it("removes the keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useLogout(vi.fn()), { wrapper });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("opens the confirmation dialog (without logging out) on Cmd/Ctrl+Shift+L", async () => {
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "L",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(result.current.confirmOpen).toBe(true);
    expect(setUser).not.toHaveBeenCalled();
    expect(mockApiClient).not.toHaveBeenCalled();
  });

  it("logs out once the shortcut-opened dialog is confirmed", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "L",
          metaKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });
    expect(result.current.confirmOpen).toBe(true);

    await act(async () => {
      await result.current.confirmLogout();
    });

    expect(setUser).toHaveBeenCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("does not trigger logout on unrelated keys", async () => {
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(result.current.confirmOpen).toBe(false);
    expect(setUser).not.toHaveBeenCalled();
  });
});
