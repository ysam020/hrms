import { renderHook } from "@testing-library/react";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

describe("useApiClient", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forwards get/post/put/patch/delete to the underlying apiClient with an AbortSignal attached", async () => {
    const { result } = renderHook(() => useApiClient());

    await result.current.get("/leaves");
    expect(apiClient.get).toHaveBeenCalledWith("/leaves", {
      signal: expect.any(AbortSignal),
    });

    await result.current.post("/leaves", { id: 1 });
    expect(apiClient.post).toHaveBeenCalledWith(
      "/leaves",
      { id: 1 },
      { signal: expect.any(AbortSignal) },
    );

    await result.current.put("/leaves", { id: 1 });
    expect(apiClient.put).toHaveBeenCalledWith(
      "/leaves",
      { id: 1 },
      { signal: expect.any(AbortSignal) },
    );

    await result.current.patch("/leaves", { id: 1 });
    expect(apiClient.patch).toHaveBeenCalledWith(
      "/leaves",
      { id: 1 },
      { signal: expect.any(AbortSignal) },
    );

    await result.current.delete("/leaves");
    expect(apiClient.delete).toHaveBeenCalledWith("/leaves", {
      signal: expect.any(AbortSignal),
    });
  });

  it("lets caller-supplied config override/extend the default signal config", async () => {
    const { result } = renderHook(() => useApiClient());
    await result.current.get("/leaves", { params: { page: 1 } });
    expect(apiClient.get).toHaveBeenCalledWith(
      "/leaves",
      expect.objectContaining({
        params: { page: 1 },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts the component-scoped signal on unmount", async () => {
    const { result, unmount } = renderHook(() => useApiClient());
    await result.current.get("/leaves");
    const signalArg = (apiClient.get as any).mock.calls[0][1]
      .signal as AbortSignal;
    expect(signalArg.aborted).toBe(false);

    unmount();

    expect(signalArg.aborted).toBe(true);
  });

  it("returns a stable object reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useApiClient());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
