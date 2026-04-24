import { renderHook } from "@testing-library/react";
import usePrimeReactTheme from "@web/shared/hooks/usePrimeReactTheme";

// CSS imports have no runtime side-effects in jsdom
vi.mock("primereact/resources/themes/lara-light-cyan/theme.css", () => ({}));
vi.mock("primereact/resources/themes/lara-dark-cyan/theme.css", () => ({}));

describe("usePrimeReactTheme", () => {
  beforeEach(() => {
    document.body.className = "";
  });

  // ── Dark theme ─────────────────────────────────────────────────────────────

  it("adds p-dark to document.body when theme is 'dark'", () => {
    renderHook(() => usePrimeReactTheme("dark"));
    expect(document.body.classList.contains("p-dark")).toBe(true);
  });

  it("removes p-light when switching to dark theme", () => {
    document.body.classList.add("p-light");
    renderHook(() => usePrimeReactTheme("dark"));
    expect(document.body.classList.contains("p-light")).toBe(false);
  });

  // ── Light theme ────────────────────────────────────────────────────────────

  it("adds p-light to document.body when theme is 'light'", () => {
    renderHook(() => usePrimeReactTheme("light"));
    expect(document.body.classList.contains("p-light")).toBe(true);
  });

  it("removes p-dark when switching to light theme", () => {
    document.body.classList.add("p-dark");
    renderHook(() => usePrimeReactTheme("light"));
    expect(document.body.classList.contains("p-dark")).toBe(false);
  });

  // ── Theme switching ────────────────────────────────────────────────────────

  it("switches from dark to light on re-render", () => {
    const { rerender } = renderHook(({ theme }) => usePrimeReactTheme(theme), {
      initialProps: { theme: "dark" },
    });
    expect(document.body.classList.contains("p-dark")).toBe(true);

    rerender({ theme: "light" });
    expect(document.body.classList.contains("p-light")).toBe(true);
    expect(document.body.classList.contains("p-dark")).toBe(false);
  });

  it("switches from light to dark on re-render", () => {
    const { rerender } = renderHook(({ theme }) => usePrimeReactTheme(theme), {
      initialProps: { theme: "light" },
    });
    expect(document.body.classList.contains("p-light")).toBe(true);

    rerender({ theme: "dark" });
    expect(document.body.classList.contains("p-dark")).toBe(true);
    expect(document.body.classList.contains("p-light")).toBe(false);
  });

  // ── Mutual exclusivity ─────────────────────────────────────────────────────

  it("never sets both p-dark and p-light at the same time (dark)", () => {
    renderHook(() => usePrimeReactTheme("dark"));
    const hasBoth =
      document.body.classList.contains("p-dark") &&
      document.body.classList.contains("p-light");
    expect(hasBoth).toBe(false);
  });

  it("never sets both p-dark and p-light at the same time (light)", () => {
    renderHook(() => usePrimeReactTheme("light"));
    const hasBoth =
      document.body.classList.contains("p-dark") &&
      document.body.classList.contains("p-light");
    expect(hasBoth).toBe(false);
  });
});
