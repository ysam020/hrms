import { renderHook } from "@testing-library/react";
import useJobTitleOptions from "@web/features/job-openings/useJobTitleOptions";
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

describe("useJobTitleOptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes the built-in default job title CEO", () => {
    mockFetch([]);
    const { result } = renderHook(() => useJobTitleOptions());
    expect(result.current.options).toContain("CEO");
  });

  it("layers in tenant-saved titles after the defaults", () => {
    mockFetch([{ name: "Chief Astronaut" }]);
    const { result } = renderHook(() => useJobTitleOptions());
    expect(result.current.options).toContain("Chief Astronaut");
  });

  it("dedupes case-insensitively across defaults and saved titles", () => {
    mockFetch([{ name: "ceo" }]);
    const { result } = renderHook(() => useJobTitleOptions());
    expect(
      result.current.options.filter((o) => o.toLowerCase() === "ceo"),
    ).toHaveLength(1);
  });

  it("saves a genuinely new title and refetches", async () => {
    const refetch = vi.fn();
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch,
    });
    mockPost.mockResolvedValue({});
    const { result } = renderHook(() => useJobTitleOptions());

    await result.current.ensureJobTitleSaved("Chief Astronaut");

    expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
      name: "Chief Astronaut",
    });
    expect(refetch).toHaveBeenCalled();
  });

  it("does not save a title that already exists (case-insensitive)", async () => {
    mockFetch([]);
    const { result } = renderHook(() => useJobTitleOptions());

    await result.current.ensureJobTitleSaved("ceo");

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("is a no-op for a blank title", async () => {
    mockFetch([]);
    const { result } = renderHook(() => useJobTitleOptions());

    await result.current.ensureJobTitleSaved("");

    expect(mockPost).not.toHaveBeenCalled();
  });

  it("swallows a failed save without throwing", async () => {
    mockFetch([]);
    mockPost.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() => useJobTitleOptions());

    await expect(
      result.current.ensureJobTitleSaved("New Title"),
    ).resolves.toBeUndefined();
  });
});
