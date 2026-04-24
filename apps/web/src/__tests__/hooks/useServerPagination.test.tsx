import { renderHook, waitFor, act } from "@testing-library/react";
import useServerPagination from "@web/shared/hooks/useServerPagination";

vi.mock("@web/core/db", () => ({
  getPaginationCache: vi.fn().mockResolvedValue(null),
  setPaginationCache: vi.fn().mockResolvedValue(undefined),
  invalidatePaginationCache: vi.fn().mockResolvedValue(undefined),
}));

const makeFetch = (data: any[] = [], totalCount = 0) =>
  vi.fn().mockResolvedValue({ data, totalCount });

// Helper: wait until the hook finishes loading
const settled = (result: any) =>
  waitFor(() => expect(result.current.loading).toBe(false));

describe("useServerPagination", () => {
  it("starts with empty data array", async () => {
    const { result } = renderHook(() => useServerPagination(makeFetch([], 0)));
    expect(result.current.data).toEqual([]);
    await settled(result); // let async fetch settle so no act() warnings
  });

  it("fetches data on mount", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const { result } = renderHook(() =>
      useServerPagination(makeFetch(rows, 2)),
    );
    await settled(result);
    expect(result.current.data).toEqual(rows);
    expect(result.current.totalCount).toBe(2);
  });

  it("defaults to page 1 and pageSize 10", async () => {
    const { result } = renderHook(() => useServerPagination(makeFetch()));
    await settled(result);
    expect(result.current.currentPage).toBe(1);
    expect(result.current.pageSize).toBe(10);
  });

  it("respects custom initialPageSize", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch(), { initialPageSize: 25 }),
    );
    await settled(result);
    expect(result.current.pageSize).toBe(25);
  });

  it("respects custom initialPage", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch(), { initialPage: 2 }),
    );
    await settled(result);
    expect(result.current.currentPage).toBe(3);
  });

  it("calculates totalPages correctly", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 45), { initialPageSize: 10 }),
    );
    await settled(result);
    expect(result.current.totalPages).toBe(5);
  });

  it("hasNextPage is true when not on last page", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 30), { initialPageSize: 10 }),
    );
    await settled(result);
    expect(result.current.hasNextPage).toBe(true);
  });

  it("hasNextPage is false on last page", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 10), { initialPageSize: 10 }),
    );
    await settled(result);
    expect(result.current.hasNextPage).toBe(false);
  });

  it("hasPrevPage is false on first page", async () => {
    const { result } = renderHook(() => useServerPagination(makeFetch()));
    await settled(result);
    expect(result.current.hasPrevPage).toBe(false);
  });

  it("hasPrevPage is true when not on first page", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 30), {
        initialPage: 1,
        initialPageSize: 10,
      }),
    );
    await settled(result);
    expect(result.current.hasPrevPage).toBe(true);
  });

  it("nextPage increments the page", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 30), { initialPageSize: 10 }),
    );
    await settled(result);

    act(() => {
      result.current.nextPage();
    });
    await settled(result); // wait for the re-fetch triggered by page change

    expect(result.current.currentPage).toBe(2);
  });

  it("nextPage does not go beyond last page", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 10), { initialPageSize: 10 }),
    );
    await settled(result);

    act(() => {
      result.current.nextPage();
    });
    await settled(result);

    expect(result.current.currentPage).toBe(1);
  });

  it("prevPage decrements the page", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 30), {
        initialPage: 1,
        initialPageSize: 10,
      }),
    );
    await settled(result);

    act(() => {
      result.current.prevPage();
    });
    await settled(result);

    expect(result.current.currentPage).toBe(1);
  });

  it("prevPage does not go below page 1", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 10), {
        initialPage: 0,
        initialPageSize: 10,
      }),
    );
    await settled(result);

    act(() => {
      result.current.prevPage();
    });
    await settled(result);

    expect(result.current.currentPage).toBe(1);
  });

  it("goToPage navigates to a valid page index", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 50), { initialPageSize: 10 }),
    );
    await settled(result);

    act(() => {
      result.current.goToPage(3);
    });
    await settled(result);

    expect(result.current.currentPage).toBe(4);
  });

  it("goToPage ignores out-of-range page index", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 20), { initialPageSize: 10 }),
    );
    await settled(result);

    act(() => {
      result.current.goToPage(99);
    });
    await settled(result);

    expect(result.current.currentPage).toBe(1);
  });

  it("handlePageSizeChange resets to first page", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 100), {
        initialPage: 2,
        initialPageSize: 10,
      }),
    );
    await settled(result);

    act(() => {
      result.current.handlePageSizeChange(25);
    });
    await settled(result);

    expect(result.current.pageSize).toBe(25);
    expect(result.current.currentPage).toBe(1);
  });

  it("resetPagination returns to page 1", async () => {
    const { result } = renderHook(() =>
      useServerPagination(makeFetch([], 50), { initialPageSize: 10 }),
    );
    await settled(result);

    act(() => {
      result.current.goToPage(3);
    });
    await settled(result);
    expect(result.current.currentPage).toBe(4);

    act(() => {
      result.current.resetPagination();
    });
    await settled(result);
    expect(result.current.currentPage).toBe(1);
  });

  it("sets error and calls onError on fetch failure", async () => {
    const onError = vi.fn();
    const failingFetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() =>
      useServerPagination(failingFetch, { onError }),
    );

    await settled(result);
    expect(result.current.error).toBeTruthy();
    expect(onError).toHaveBeenCalled();
  });

  it("handles fetch returning a plain array", async () => {
    const arrayFetch = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);

    const { result } = renderHook(() => useServerPagination(arrayFetch));

    await settled(result);
    expect(result.current.data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("handles fetch returning null/undefined gracefully", async () => {
    const nullFetch = vi.fn().mockResolvedValue(null);

    const { result } = renderHook(() => useServerPagination(nullFetch));

    await settled(result);
    expect(result.current.data).toEqual([]);
    expect(result.current.totalCount).toBe(0);
  });

  it("refresh re-fetches current page", async () => {
    const fetchFn = makeFetch([{ id: 1 }], 1);

    const { result } = renderHook(() => useServerPagination(fetchFn));
    await settled(result);

    const callsBefore = fetchFn.mock.calls.length;
    act(() => {
      result.current.refresh();
    });
    await waitFor(() =>
      expect(fetchFn.mock.calls.length).toBeGreaterThan(callsBefore),
    );
    await settled(result);
  });
});
