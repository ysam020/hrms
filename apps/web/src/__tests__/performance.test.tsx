import { act, render, renderHook, screen } from "@testing-library/react";
import { useState } from "react";
import { DataTable, type Column } from "@next/ui";
import { sameStyle } from "@next/ui/layers";
import { useDebouncedCallback } from "@next/lib/hooks";

// Performance pass (docs/performance.md): the shared debounce, memoised
// table rows, and popovers that only re-render when they move.

describe("useDebouncedCallback", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("runs once, after the last call, with its arguments", () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));
    result.current("a");
    vi.advanceTimersByTime(200);
    result.current("ab");
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("ab");
  });

  it("keeps the same function across renders and calls the latest callback", () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { result, rerender } = renderHook(
      ({ fn }) => useDebouncedCallback(fn, 300),
      { initialProps: { fn: first } },
    );
    const run = result.current;
    rerender({ fn: latest });
    expect(result.current).toBe(run);
    run("q");
    vi.advanceTimersByTime(300);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith("q");
  });

  it("drops a pending run on unmount and on cancel", () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn));
    result.current("x");
    result.current.cancel();
    vi.advanceTimersByTime(1000);
    result.current("y");
    unmount();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe("DataTable rows", () => {
  type Row = { id: string; name: string };
  const all: Row[] = Array.from({ length: 20 }, (_, i) => ({
    id: `r${i}`,
    name: `Person ${i}`,
  }));
  const renders = vi.fn();
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      render: (r) => {
        renders(r.id);
        return r.name;
      },
    },
  ];

  function Filtered() {
    const [q, setQ] = useState("");
    const rows = all.filter((r) => r.name.includes(q));
    return (
      <>
        <input
          aria-label="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <DataTable
          label="People"
          columns={columns}
          rows={rows}
          rowId={(r) => r.id}
        />
      </>
    );
  }

  it("doesn't re-render unchanged rows when the list is filtered", () => {
    render(<Filtered />);
    expect(renders).toHaveBeenCalledTimes(20);
    renders.mockClear();
    act(() => {
      const input = screen.getByLabelText("q") as HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      set.call(input, "Person 1");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // "Person 1", "Person 10"…"Person 19" stay; none of them re-render.
    expect(screen.getAllByRole("row")).toHaveLength(1 + 11);
    expect(renders).not.toHaveBeenCalled();
  });

  it("re-renders a row whose data changes", () => {
    const { rerender } = render(
      <DataTable
        label="People"
        columns={columns}
        rows={all.slice(0, 3)}
        rowId={(r) => r.id}
      />,
    );
    renders.mockClear();
    const next = [all[0], { ...all[1], name: "Renamed" }, all[2]];
    rerender(
      <DataTable
        label="People"
        columns={columns}
        rows={next}
        rowId={(r) => r.id}
      />,
    );
    expect(renders.mock.calls).toEqual([["r1"]]);
    expect(screen.getByText("Renamed")).toBeInTheDocument();
  });
});

describe("sameStyle", () => {
  it("compares computed positions by value", () => {
    expect(sameStyle({ top: 10, left: 4 }, { left: 4, top: 10 })).toBe(true);
    expect(sameStyle({ top: 10 }, { top: 11 })).toBe(false);
    expect(sameStyle({ top: 10 }, { bottom: 10 })).toBe(false);
    expect(sameStyle({ top: 10 }, { top: 10, left: 0 })).toBe(false);
  });
});
