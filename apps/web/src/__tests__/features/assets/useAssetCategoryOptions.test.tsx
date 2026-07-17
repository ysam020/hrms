import { renderHook, waitFor } from "@testing-library/react";
import useAssetCategoryOptions from "@web/features/assets/useAssetCategoryOptions";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/shared/hooks/useFetchData");
vi.mock("@web/core/http/axiosConfig", () => ({ default: { post: vi.fn() } }));

const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

function mockFetch(data: any) {
  mockUseFetchData.mockReturnValue({
    data,
    loading: false,
    error: null,
    refetch: vi.fn(),
  });
}

describe("useAssetCategoryOptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts every tenant off with the built-in default categories", () => {
    mockFetch([]);
    const { result } = renderHook(() => useAssetCategoryOptions());
    expect(result.current.options).toEqual([
      "Laptop",
      "Desktop",
      "Monitor",
      "Phone",
      "Tablet",
      "Furniture",
      "Vehicle",
      "Other",
    ]);
  });

  it("layers in tenant-saved categories after the defaults", () => {
    mockFetch([{ name: "Camera" }, { name: "Projector" }]);
    const { result } = renderHook(() => useAssetCategoryOptions());
    expect(result.current.options.slice(-2)).toEqual(["Camera", "Projector"]);
  });

  it("dedupes case-insensitively and trims whitespace, keeping the first occurrence", () => {
    mockFetch([{ name: "  laptop  " }, { name: "Camera" }]);
    const { result } = renderHook(() => useAssetCategoryOptions());
    expect(
      result.current.options.filter((o) => o.toLowerCase() === "laptop"),
    ).toHaveLength(1);
    expect(result.current.options).toContain("Camera");
  });

  it("filters out blank/falsy saved category names", () => {
    mockFetch([{ name: "" }, { name: null }, { name: "Camera" }]);
    const { result } = renderHook(() => useAssetCategoryOptions());
    expect(result.current.options).toContain("Camera");
    expect(result.current.options.filter(Boolean).length).toBe(
      result.current.options.length,
    );
  });

  it("saves a genuinely new category and refetches", async () => {
    const refetch = vi.fn();
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch,
    });
    mockPost.mockResolvedValue({});
    const { result } = renderHook(() => useAssetCategoryOptions());

    await result.current.ensureAssetCategorySaved("Drone");

    expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
      name: "Drone",
    });
    expect(refetch).toHaveBeenCalled();
  });

  it("does not save a category that already exists (case-insensitive)", async () => {
    mockFetch([]);
    const { result } = renderHook(() => useAssetCategoryOptions());

    await result.current.ensureAssetCategorySaved("laptop");

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("is a no-op for a blank category", async () => {
    mockFetch([]);
    const { result } = renderHook(() => useAssetCategoryOptions());

    await result.current.ensureAssetCategorySaved("   ");

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("swallows a failed save without throwing", async () => {
    mockFetch([]);
    mockPost.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useAssetCategoryOptions());

    await expect(
      result.current.ensureAssetCategorySaved("Drone"),
    ).resolves.toBeUndefined();
  });
});
