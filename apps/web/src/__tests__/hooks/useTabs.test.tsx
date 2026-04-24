import { render, screen } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import useTabs from "@web/shared/hooks/useTabs";

describe("useTabs", () => {
  it("returns a11yProps and CustomTabPanel", () => {
    const { result } = renderHook(() => useTabs());
    expect(typeof result.current.a11yProps).toBe("function");
    expect(typeof result.current.CustomTabPanel).toBe("function");
  });

  describe("a11yProps", () => {
    it("returns correct id for index 0", () => {
      const { result } = renderHook(() => useTabs());
      expect(result.current.a11yProps(0).id).toBe("simple-tab-0");
    });

    it("returns correct aria-controls for index 0", () => {
      const { result } = renderHook(() => useTabs());
      expect(result.current.a11yProps(0)["aria-controls"]).toBe(
        "simple-tabpanel-0",
      );
    });

    it("works for any index", () => {
      const { result } = renderHook(() => useTabs());
      [1, 3, 7].forEach((i) => {
        expect(result.current.a11yProps(i).id).toBe(`simple-tab-${i}`);
        expect(result.current.a11yProps(i)["aria-controls"]).toBe(
          `simple-tabpanel-${i}`,
        );
      });
    });
  });

  describe("CustomTabPanel", () => {
    it("renders children when value matches index", () => {
      const { result } = renderHook(() => useTabs());
      const { CustomTabPanel } = result.current;
      render(
        <CustomTabPanel value={1} index={1}>
          <span>Panel Content</span>
        </CustomTabPanel>,
      );
      expect(screen.getByText("Panel Content")).toBeInTheDocument();
    });

    it("is hidden when value does not match index", () => {
      const { result } = renderHook(() => useTabs());
      const { CustomTabPanel } = result.current;
      render(
        <CustomTabPanel value={0} index={2}>
          <span>Hidden Panel</span>
        </CustomTabPanel>,
      );
      const panel = screen.getByRole("tabpanel", { hidden: true });
      expect(panel).toHaveAttribute("hidden");
    });

    it("renders with correct id", () => {
      const { result } = renderHook(() => useTabs());
      const { CustomTabPanel } = result.current;
      render(
        <CustomTabPanel value={3} index={3}>
          <span>Content</span>
        </CustomTabPanel>,
      );
      expect(screen.getByRole("tabpanel")).toHaveAttribute(
        "id",
        "simple-tabpanel-3",
      );
    });

    it("renders with correct aria-labelledby", () => {
      const { result } = renderHook(() => useTabs());
      const { CustomTabPanel } = result.current;
      render(
        <CustomTabPanel value={2} index={2}>
          <span>Content</span>
        </CustomTabPanel>,
      );
      expect(screen.getByRole("tabpanel")).toHaveAttribute(
        "aria-labelledby",
        "simple-tab-2",
      );
    });

    it("renders multiple panels with only the active one visible", () => {
      const { result } = renderHook(() => useTabs());
      const { CustomTabPanel } = result.current;
      render(
        <>
          <CustomTabPanel value={1} index={0}>
            <span>Panel 0</span>
          </CustomTabPanel>
          <CustomTabPanel value={1} index={1}>
            <span>Panel 1</span>
          </CustomTabPanel>
          <CustomTabPanel value={1} index={2}>
            <span>Panel 2</span>
          </CustomTabPanel>
        </>,
      );
      // Only panel at index 1 is visible
      const panels = screen.getAllByRole("tabpanel", { hidden: true });
      expect(panels[0]).toHaveAttribute("hidden");
      expect(panels[1]).not.toHaveAttribute("hidden");
      expect(panels[2]).toHaveAttribute("hidden");
    });
  });
});
