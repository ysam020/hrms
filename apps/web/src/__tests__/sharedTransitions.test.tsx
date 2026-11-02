import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import {
  clearHandoffs,
  handOff,
  markTransitionSource,
  sharedPart,
  transitionSource,
  useArrivingAt,
  useHandoff,
  useTransitionWith,
  vtName,
} from "@next/motion";
import { setScope } from "@next/offline/state";

// Shared-element transitions (motion/viewTransition.tsx): naming, and the
// in-memory hand-off a list makes to the detail page it opens.

const wrap = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe("sharedPart", () => {
  it("names a part of an entity, with a per-part class", () => {
    expect(sharedPart("person", "asha.rao", "avatar")).toEqual({
      viewTransitionName: "person-avatar-asha_rao",
      viewTransitionClass: "px-vt-avatar",
    });
  });

  it("names nothing when off", () => {
    expect(sharedPart("job", "j1", "title", false)).toBeUndefined();
  });

  it("produces CSS-ident-safe names", () => {
    expect(vtName("person-title", "a.b@c d")).toBe("person-title-a_b_c_d");
  });
});

describe("transition state hooks", () => {
  it("are false when no view transition is running (and need no data router)", () => {
    const pair = renderHook(() => useTransitionWith("/x/:id"), {
      wrapper: wrap,
    });
    const arriving = renderHook(() => useArrivingAt("/x/1"), { wrapper: wrap });
    expect(pair.result.current).toBe(false);
    expect(arriving.result.current).toBe(false);
  });
});

describe("hand-off", () => {
  beforeEach(() => {
    clearHandoffs();
    setScope("tenant-a:user-1");
  });
  afterEach(() => {
    vi.useRealTimers();
    setScope(null);
  });

  it("gives the detail page what the row showed, in the same session", () => {
    handOff("person", "asha.rao", { name: "Asha Rao" });
    const { result } = renderHook(() => useHandoff("person", "asha.rao"));
    expect(result.current).toEqual({ name: "Asha Rao" });
  });

  it("is never read by another tenant or user", () => {
    handOff("person", "asha.rao", { name: "Asha Rao" });
    setScope("tenant-b:user-9");
    const { result } = renderHook(() => useHandoff("person", "asha.rao"));
    expect(result.current).toBeNull();
  });

  it("is not made without a signed-in scope", () => {
    setScope(null);
    handOff("person", "asha.rao", { name: "Asha Rao" });
    setScope("tenant-a:user-1");
    const { result } = renderHook(() => useHandoff("person", "asha.rao"));
    expect(result.current).toBeNull();
  });

  it("expires", () => {
    vi.useFakeTimers();
    handOff("job", "j1", { jobTitle: "Designer" });
    vi.advanceTimersByTime(11_000);
    const { result } = renderHook(() => useHandoff("job", "j1"));
    expect(result.current).toBeNull();
  });

  it("is cleared on sign-out, with the transition source", () => {
    handOff("ticket", "t1", { title: "Wi-Fi" });
    markTransitionSource("widget:approvals");
    clearHandoffs();
    const { result } = renderHook(() => useHandoff("ticket", "t1"));
    expect(result.current).toBeNull();
    expect(transitionSource()).toBeNull();
  });

  it("only matches the same entity", () => {
    handOff("person", "asha.rao", { name: "Asha Rao" });
    const { result } = renderHook(() => useHandoff("person", "dev.mehta"));
    expect(result.current).toBeNull();
  });
});

describe("transition source", () => {
  afterEach(() => vi.useRealTimers());

  it("remembers which element started the navigation, briefly", () => {
    vi.useFakeTimers();
    markTransitionSource("widget:approvals");
    expect(transitionSource()).toBe("widget:approvals");
    vi.advanceTimersByTime(2_500);
    expect(transitionSource()).toBeNull();
  });
});
