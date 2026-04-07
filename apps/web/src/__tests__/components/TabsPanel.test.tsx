import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TabsPanel from "@web/shared/components/TabsPanel";

const Tab1 = () => <div>Tab One Content</div>;
const Tab2 = () => <div>Tab Two Content</div>;
const Tab3 = () => <div>Tab Three Content</div>;

const tabData = [
  { label: "Tab One", component: Tab1 },
  { label: "Tab Two", component: Tab2 },
  { label: "Tab Three", component: Tab3 },
];

const future = { v7_startTransition: true, v7_relativeSplatPath: true };

const renderTabs = (ui: React.ReactElement) =>
  render(<MemoryRouter future={future}>{ui}</MemoryRouter>);

describe("TabsPanel", () => {
  beforeEach(() => localStorage.clear());

  it("renders all tab labels", () => {
    renderTabs(<TabsPanel tabData={tabData} tabKey="test-tabs" />);
    expect(screen.getByText("Tab One")).toBeInTheDocument();
    expect(screen.getByText("Tab Two")).toBeInTheDocument();
    expect(screen.getByText("Tab Three")).toBeInTheDocument();
  });

  it("shows first tab content by default", () => {
    renderTabs(<TabsPanel tabData={tabData} tabKey="test-tabs" />);
    expect(screen.getByText("Tab One Content")).toBeInTheDocument();
  });

  it("hides non-active tab content initially", () => {
    renderTabs(<TabsPanel tabData={tabData} tabKey="test-tabs" />);
    // Non-active panels render with hidden attribute and empty content
    const panel2 = document.getElementById("simple-tabpanel-1");
    expect(panel2).toHaveAttribute("hidden");
  });

  it("switches to second tab when clicked", () => {
    renderTabs(<TabsPanel tabData={tabData} tabKey="test-tabs" />);
    fireEvent.click(screen.getByText("Tab Two"));
    expect(screen.getByText("Tab Two Content")).toBeVisible();
  });

  it("persists active tab index to localStorage on change", () => {
    renderTabs(<TabsPanel tabData={tabData} tabKey="test-tabs" />);
    fireEvent.click(screen.getByText("Tab Two"));
    expect(localStorage.getItem("test-tabs")).toBeTruthy();
  });

  it("restores active tab from localStorage", () => {
    localStorage.setItem("test-tabs", "1");
    renderTabs(<TabsPanel tabData={tabData} tabKey="test-tabs" />);
    const panel2 = screen.getByRole("tabpanel", { name: /Tab Two/i });
    expect(panel2).not.toHaveAttribute("hidden");
  });

  it("renders tab content as React element when given a component", () => {
    renderTabs(
      <TabsPanel
        tabData={[{ label: "Direct", component: <div>Direct Element</div> }]}
        tabKey="direct-tab"
      />,
    );
    expect(screen.getByText("Direct Element")).toBeInTheDocument();
  });
});
