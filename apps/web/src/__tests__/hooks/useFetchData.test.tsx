import { renderHook, waitFor, act } from "@testing-library/react";
import useFetchData from "@web/shared/hooks/useFetchData";
import { AlertContext } from "@web/app/providers/AlertContext";

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: {
    get: (...args: any[]) => mockGet(...args),
    post: (...args: any[]) => mockPost(...args),
  },
}));

vi.mock("@web/core/db", () => ({
  getAnalyticsCache: vi.fn().mockResolvedValue(null),
  setAnalyticsCache: vi.fn().mockResolvedValue(undefined),
}));

const mockSetAlert = vi.fn();

const wrapper = ({ children }: any) => (
  <AlertContext.Provider
    value={{
      alert: { open: false, message: "", severity: "info" },
      setAlert: mockSetAlert,
    }}
  >
    {children}
  </AlertContext.Provider>
);

describe("useFetchData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts with loading=false and empty data when uri is null", () => {
    const { result } = renderHook(() => useFetchData(null, "get"), { wrapper });
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([]);
  });

  it("does not call the API when uri is null", () => {
    renderHook(() => useFetchData(null, "get"), { wrapper });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("fetches data and sets it on success", async () => {
    mockGet.mockResolvedValue({ data: { data: [{ id: 1 }, { id: 2 }] } });

    const { result } = renderHook(() => useFetchData("/users", "get"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.error).toBeNull();
  });

  it("uses res.data directly when res.data.data is absent", async () => {
    mockGet.mockResolvedValue({ data: [{ id: 99 }] });

    const { result } = renderHook(() => useFetchData("/items", "get"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual([{ id: 99 }]);
  });

  it("sets loading=true while the request is in flight", async () => {
    let resolve: (v: any) => void;
    mockGet.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { result } = renderHook(() => useFetchData("/slow", "get"), {
      wrapper,
    });

    expect(result.current.loading).toBe(true);

    act(() => resolve!({ data: { data: [] } }));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("sets error and clears data on fetch failure", async () => {
    mockGet.mockRejectedValue(new Error("Server error"));

    const { result } = renderHook(
      () => useFetchData("/broken", "get", [], null, "Fetch failed"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("Server error");
  });

  it("shows error alert when errMessage provided and fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("Oops"));

    renderHook(
      () => useFetchData("/broken", "get", [], null, "Something went wrong"),
      { wrapper },
    );

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ open: true, severity: "error" }),
      ),
    );
  });

  it("shows success alert when successMessage provided and fetch succeeds", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    renderHook(() => useFetchData("/ok", "get", [], "Data loaded!", null), {
      wrapper,
    });

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          open: true,
          severity: "success",
          message: "Data loaded!",
        }),
      ),
    );
  });

  it("does not show alerts when no message strings are provided", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    renderHook(() => useFetchData("/ok", "get"), { wrapper });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockSetAlert).not.toHaveBeenCalled();
  });

  it("returns a refetch function", () => {
    const { result } = renderHook(() => useFetchData(null, "get"), { wrapper });
    expect(typeof result.current.refetch).toBe("function");
  });

  it("refetch triggers a new request", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });

    const { result } = renderHook(() => useFetchData("/users", "get"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = mockGet.mock.calls.length;

    act(() => {
      result.current.refetch();
    });

    await waitFor(() =>
      expect(mockGet.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it("uses POST method when specified", async () => {
    mockPost.mockResolvedValue({ data: { data: [] } });

    renderHook(() => useFetchData("/submit", "post"), { wrapper });

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("ignores CanceledError and does not set error state or alert", async () => {
    const abortErr = Object.assign(new Error("canceled"), {
      name: "CanceledError",
    });
    mockGet.mockRejectedValue(abortErr);

    const { result } = renderHook(
      () => useFetchData("/aborted", "get", [], null, "Failed"),
      { wrapper },
    );

    // CanceledError causes an early return — loading stays true (no state update)
    // and error is never set. Wait a tick to let the microtask queue settle.
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
    expect(mockSetAlert).not.toHaveBeenCalled();
  });
});
