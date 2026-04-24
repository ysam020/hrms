import { renderHook } from "@testing-library/react";
import useUpdateFavicon from "@web/shared/hooks/useUpdateFavicon";

const mockUpdateFaviconWithDot = vi.fn();
const mockUpdateDocumentTitle = vi.fn();

vi.mock("@web/shared/utils/faviconUtils", () => ({
  updateFaviconWithDot: (...args: any[]) => mockUpdateFaviconWithDot(...args),
  updateDocumentTitle: (...args: any[]) => mockUpdateDocumentTitle(...args),
}));

describe("useUpdateFavicon", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial effect ─────────────────────────────────────────────────────────

  it("calls updateDocumentTitle with the data length on mount", () => {
    renderHook(() => useUpdateFavicon(["a", "b", "c"]));
    expect(mockUpdateDocumentTitle).toHaveBeenCalledWith(3);
  });

  it("calls updateDocumentTitle(0) for an empty data array", () => {
    renderHook(() => useUpdateFavicon([]));
    expect(mockUpdateDocumentTitle).toHaveBeenCalledWith(0);
  });

  it("calls updateFaviconWithDot(true) when data is non-empty", () => {
    renderHook(() => useUpdateFavicon(["notification"]));
    expect(mockUpdateFaviconWithDot).toHaveBeenCalledWith(true);
  });

  it("calls updateFaviconWithDot(false) when data is empty", () => {
    renderHook(() => useUpdateFavicon([]));
    expect(mockUpdateFaviconWithDot).toHaveBeenCalledWith(false);
  });

  // ── updateFavicon helper ───────────────────────────────────────────────────

  it("updateFavicon(true) calls updateFaviconWithDot with true", () => {
    const { result } = renderHook(() => useUpdateFavicon([]));
    vi.clearAllMocks();
    result.current.updateFavicon(true);
    expect(mockUpdateFaviconWithDot).toHaveBeenCalledWith(true);
  });

  it("updateFavicon(false) calls updateFaviconWithDot with false", () => {
    const { result } = renderHook(() => useUpdateFavicon(["x"]));
    vi.clearAllMocks();
    result.current.updateFavicon(false);
    expect(mockUpdateFaviconWithDot).toHaveBeenCalledWith(false);
  });

  // ── Data changes ───────────────────────────────────────────────────────────

  it("re-runs effect when data reference changes", () => {
    const { rerender } = renderHook(({ data }) => useUpdateFavicon(data), {
      initialProps: { data: [] as string[] },
    });
    expect(mockUpdateDocumentTitle).toHaveBeenCalledWith(0);
    expect(mockUpdateFaviconWithDot).toHaveBeenCalledWith(false);

    rerender({ data: ["new-item"] });
    expect(mockUpdateDocumentTitle).toHaveBeenCalledWith(1);
    expect(mockUpdateFaviconWithDot).toHaveBeenCalledWith(true);
  });

  it("calls both utilities exactly once on initial mount", () => {
    renderHook(() => useUpdateFavicon(["a", "b"]));
    expect(mockUpdateDocumentTitle).toHaveBeenCalledTimes(1);
    expect(mockUpdateFaviconWithDot).toHaveBeenCalledTimes(1);
  });
});
