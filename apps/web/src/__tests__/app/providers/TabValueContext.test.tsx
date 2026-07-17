import { render, screen } from "@testing-library/react";
import {
  TabValueContext,
  useTabValue,
} from "@web/app/providers/TabValueContext";

function Probe() {
  const { tabValue, setTabValue } = useTabValue();
  return (
    <div>
      <span>tabValue: {tabValue}</span>
      <button onClick={() => setTabValue(2)}>set</button>
    </div>
  );
}

describe("TabValueContext", () => {
  it("defaults to tabValue 0 and a no-op setter when used without a provider", () => {
    render(<Probe />);
    expect(screen.getByText("tabValue: 0")).toBeInTheDocument();
  });

  it("reflects the value supplied by a provider", () => {
    render(
      <TabValueContext.Provider value={{ tabValue: 3, setTabValue: vi.fn() }}>
        <Probe />
      </TabValueContext.Provider>,
    );
    expect(screen.getByText("tabValue: 3")).toBeInTheDocument();
  });
});
