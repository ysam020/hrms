import { renderHook, act } from "@testing-library/react";
import {
  DashboardEditProvider,
  useDashboardEdit,
} from "@web/app/providers/DashboardEditContext";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DashboardEditProvider>{children}</DashboardEditProvider>
);

describe("DashboardEditContext", () => {
  it("starts with editMode false and no registered reset fn", () => {
    const { result } = renderHook(() => useDashboardEdit(), { wrapper });
    expect(result.current.editMode).toBe(false);
    expect(result.current.resetFn).toBeNull();
  });

  it("toggleEditMode flips editMode on each call", () => {
    const { result } = renderHook(() => useDashboardEdit(), { wrapper });
    act(() => result.current.toggleEditMode());
    expect(result.current.editMode).toBe(true);
    act(() => result.current.toggleEditMode());
    expect(result.current.editMode).toBe(false);
  });

  it("registerReset stores the given function for later retrieval", () => {
    const { result } = renderHook(() => useDashboardEdit(), { wrapper });
    const resetFn = () => {};
    act(() => result.current.registerReset(resetFn));
    expect(result.current.resetFn).toBe(resetFn);
  });

  it("registerReset replaces a previously registered function", () => {
    const { result } = renderHook(() => useDashboardEdit(), { wrapper });
    const first = () => "first";
    const second = () => "second";
    act(() => result.current.registerReset(first));
    act(() => result.current.registerReset(second));
    expect(result.current.resetFn).toBe(second);
  });
});
