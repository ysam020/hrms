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

  it("returns a function", () => {
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });
    expect(typeof result.current).toBe("function");
  });

  it("calls setUser(null) and navigates to /login on success", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(setUser).toHaveBeenCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("calls cancelAllPendingRequests on successful logout", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(mockCancelAllPendingRequests).toHaveBeenCalledWith("logout");
  });

  it("preserves theme in localStorage after logout", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(localStorage.getItem("theme")).toBe(JSON.stringify("dark"));
  });

  it("clears non-theme keys from localStorage after logout", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(localStorage.getItem("someOtherKey")).toBeNull();
  });

  it("still logs out when the API call fails", async () => {
    mockApiClient.mockRejectedValue(new Error("Network error"));
    const setUser = vi.fn();
    const { result } = renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(setUser).toHaveBeenCalledWith(null);
    expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
  });

  it("preserves theme even when API call fails", async () => {
    mockApiClient.mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useLogout(vi.fn()), { wrapper });

    await act(async () => {
      await result.current();
    });

    expect(localStorage.getItem("theme")).toBe(JSON.stringify("dark"));
  });

  it("removes the keydown listener on unmount", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useLogout(vi.fn()), { wrapper });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("triggers logout on Ctrl+Shift+L", async () => {
    mockApiClient.mockResolvedValue({ data: { success: true } });
    const setUser = vi.fn();
    renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "l",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
    });

    expect(setUser).toHaveBeenCalledWith(null);
  });

  it("does not trigger logout on unrelated keys", async () => {
    const setUser = vi.fn();
    renderHook(() => useLogout(setUser), { wrapper });

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(setUser).not.toHaveBeenCalled();
  });
});
