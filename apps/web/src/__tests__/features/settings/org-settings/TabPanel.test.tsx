import { render, screen } from "@testing-library/react";
import { TabPanel } from "@web/features/settings/org-settings/TabPanel";

describe("TabPanel", () => {
  it("renders children only when value matches index", () => {
    const { rerender } = render(
      <TabPanel value={0} index={0}>
        <span>Content</span>
      </TabPanel>,
    );
    expect(screen.getByText("Content")).toBeInTheDocument();

    rerender(
      <TabPanel value={1} index={0}>
        <span>Content</span>
      </TabPanel>,
    );
    expect(screen.queryByText("Content")).not.toBeInTheDocument();
  });
});
