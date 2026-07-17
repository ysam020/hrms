import { renderHook, act } from "@testing-library/react";
import {
  BottomDrawerProvider,
  useBottomDrawer,
} from "@web/app/providers/BottomDrawerContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <BottomDrawerProvider>{children}</BottomDrawerProvider>
);

describe("BottomDrawerContext", () => {
  it("starts with no drawer open", () => {
    const { result } = renderHook(() => useBottomDrawer(), { wrapper });
    expect(result.current.isAnyOpen).toBe(false);
  });

  it("marks isAnyOpen true once a drawer opens", () => {
    const { result } = renderHook(() => useBottomDrawer(), { wrapper });
    act(() => result.current.setDrawerOpen(true));
    expect(result.current.isAnyOpen).toBe(true);
  });

  it("tracks multiple concurrently-open drawers as a count, not a boolean flip", () => {
    const { result } = renderHook(() => useBottomDrawer(), { wrapper });
    act(() => result.current.setDrawerOpen(true));
    act(() => result.current.setDrawerOpen(true));
    act(() => result.current.setDrawerOpen(false)); // closes one of two
    expect(result.current.isAnyOpen).toBe(true); // second is still open
    act(() => result.current.setDrawerOpen(false));
    expect(result.current.isAnyOpen).toBe(false);
  });

  it("never goes negative when closed more times than opened", () => {
    const { result } = renderHook(() => useBottomDrawer(), { wrapper });
    act(() => result.current.setDrawerOpen(false));
    act(() => result.current.setDrawerOpen(false));
    act(() => result.current.setDrawerOpen(true));
    expect(result.current.isAnyOpen).toBe(true);
  });
});
