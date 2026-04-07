import { renderHook, act } from "@testing-library/react";
import useTheme from "@web/shared/hooks/useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to light theme when localStorage is empty", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("reads initial theme from localStorage", () => {
    localStorage.setItem("theme", JSON.stringify("dark"));
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });

  it("toggles from light to dark", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("dark");
  });

  it("toggles from dark back to light", () => {
    localStorage.setItem("theme", JSON.stringify("dark"));
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(result.current.theme).toBe("light");
  });

  it("persists theme change to localStorage", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.toggleTheme();
    });

    expect(localStorage.getItem("theme")).toBe(JSON.stringify("dark"));
  });

  it("returns light when localStorage has invalid JSON", () => {
    localStorage.setItem("theme", "not-valid-json{{{");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("light");
  });

  it("returns stable toggleTheme reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useTheme());
    const firstToggle = result.current.toggleTheme;
    rerender();
    expect(result.current.toggleTheme).toBe(firstToggle);
  });
});
