import { renderHook, act } from "@testing-library/react";
import useTableConfig from "@web/shared/hooks/useTableConfig";

vi.mock("@mui/material", async () => {
  const real = await vi.importActual<any>("@mui/material");
  return {
    ...real,
    useTheme: () => ({
      palette: {
        mode: "light",
        action: { hover: "rgba(0,0,0,0.04)" },
      },
    }),
  };
});

vi.mock("@web/shared/utils/generateSkeletonData", () => ({
  default: (columns: any[]) =>
    columns.map((_, i) => ({ __skeleton: true, id: i })),
}));

const COLUMNS = [{ accessorKey: "name" }, { accessorKey: "email" }];
const DATA = [
  { name: "Alice", email: "alice@test.com" },
  { name: "Bob", email: "bob@test.com" },
];

describe("useTableConfig – basic structure", () => {
  it("returns a table config object", () => {
    const { result } = renderHook(() => useTableConfig(DATA, COLUMNS, false));
    expect(result.current.table).toBeDefined();
    expect(typeof result.current.table).toBe("object");
  });

  it("returns the actual data when not loading", () => {
    const { result } = renderHook(() => useTableConfig(DATA, COLUMNS, false));
    expect(result.current.table.data).toEqual(DATA);
  });

  it("uses skeleton data when loading=true", () => {
    const { result } = renderHook(() => useTableConfig(DATA, COLUMNS, true));
    expect(result.current.table.data).toEqual([
      { __skeleton: true, id: 0 },
      { __skeleton: true, id: 1 },
    ]);
  });

  it("passes columns through to the table config", () => {
    const { result } = renderHook(() => useTableConfig(DATA, COLUMNS, false));
    expect(result.current.table.columns).toBe(COLUMNS);
  });

  it("includes a renderEmptyRowsFallback function", () => {
    const { result } = renderHook(() => useTableConfig(DATA, COLUMNS, false));
    expect(typeof result.current.table.renderEmptyRowsFallback).toBe(
      "function",
    );
  });

  it("renderEmptyRowsFallback returns JSX (truthy)", () => {
    const { result } = renderHook(() => useTableConfig(DATA, COLUMNS, false));
    const fallback = result.current.table.renderEmptyRowsFallback();
    expect(fallback).toBeTruthy();
  });
});

describe("useTableConfig – pagination return values", () => {
  it("returns pagination=null when server-side pagination is disabled", () => {
    const { result } = renderHook(() => useTableConfig(DATA, COLUMNS, false));
    expect(result.current.pagination).toBeNull();
    expect(result.current.setPagination).toBeNull();
  });

  it("returns pagination object when enableServerSidePagination=true", () => {
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
      }),
    );
    expect(result.current.pagination).not.toBeNull();
    expect(result.current.pagination?.pageIndex).toBe(0);
    expect(result.current.pagination?.pageSize).toBe(10);
  });

  it("returns setPagination function when server-side is enabled", () => {
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
      }),
    );
    expect(typeof result.current.setPagination).toBe("function");
  });

  it("respects initialPagination option", () => {
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
        initialPagination: { pageIndex: 2, pageSize: 25 },
      }),
    );
    expect(result.current.pagination?.pageIndex).toBe(2);
    expect(result.current.pagination?.pageSize).toBe(25);
  });
});

describe("useTableConfig – server-side pagination config", () => {
  it("sets manualPagination=true when server-side is enabled", () => {
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
        totalRowCount: 50,
      }),
    );
    expect(result.current.table.manualPagination).toBe(true);
  });

  it("forwards totalRowCount as rowCount", () => {
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
        totalRowCount: 123,
      }),
    );
    expect(result.current.table.rowCount).toBe(123);
  });

  it("calls onPaginationChange when pagination changes", () => {
    const onPaginationChange = vi.fn();
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
        onPaginationChange,
      }),
    );

    act(() => {
      result.current.table.onPaginationChange({ pageIndex: 1, pageSize: 10 });
    });

    expect(onPaginationChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 1 }),
    );
  });

  it("updates internal pagination state when onPaginationChange is called", () => {
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
      }),
    );

    act(() => {
      result.current.table.onPaginationChange({ pageIndex: 3, pageSize: 10 });
    });

    expect(result.current.pagination?.pageIndex).toBe(3);
  });
});

describe("useTableConfig – custom options merging", () => {
  it("merges custom options into the table config", () => {
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        myCustomProp: "hello",
      }),
    );
    expect((result.current.table as any).myCustomProp).toBe("hello");
  });

  it("custom options are spread last and can override built-in props", () => {
    // The source spreads ...customOptions after the fixed server-side props,
    // so a caller CAN override them — this is the documented behaviour.
    const { result } = renderHook(() =>
      useTableConfig(DATA, COLUMNS, false, {
        enableServerSidePagination: true,
        manualPagination: false,
      }),
    );
    expect(result.current.table.manualPagination).toBe(false);
  });
});
