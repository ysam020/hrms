import { render, screen, fireEvent } from "@testing-library/react";
import { MonthStatsSection } from "@web/features/dashboard/my-workspace/MonthStatsSection";

function renderSection(
  overrides: Partial<React.ComponentProps<typeof MonthStatsSection>> = {},
) {
  return render(
    <MonthStatsSection
      borderColor="#eee"
      loadingSummary={false}
      paidLeavesUsed={2}
      lwpUsed={0}
      presents={20}
      holidays={2}
      weekOffs={4}
      correctionPct={50}
      corrColor="#3b82f6"
      remainingCorrections={2}
      maxCorrections={4}
      pendingCount={0}
      loadingPendingLeaves={false}
      onPendingClick={vi.fn()}
      {...overrides}
    />,
  );
}

describe("MonthStatsSection", () => {
  it("shows a skeleton instead of stats while loading", () => {
    const { container } = renderSection({ loadingSummary: true });
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    expect(screen.queryByText("PL Used")).not.toBeInTheDocument();
  });

  it("shows all stat values once loaded", () => {
    renderSection();
    expect(screen.getByText("2/4 left")).toBeInTheDocument();
  });

  it("hides the pending-approvals alert when there are none", () => {
    renderSection({ pendingCount: 0 });
    expect(screen.queryByText(/pending approval/)).not.toBeInTheDocument();
  });

  it("hides the pending-approvals alert while it is still loading", () => {
    renderSection({ pendingCount: 3, loadingPendingLeaves: true });
    expect(screen.queryByText(/pending approval/)).not.toBeInTheDocument();
  });

  it("shows a singular pending-approval message for exactly one", () => {
    renderSection({ pendingCount: 1 });
    expect(screen.getByText("⚠ 1 leave pending approval")).toBeInTheDocument();
  });

  it("shows a pluralized pending-approval message for more than one", () => {
    renderSection({ pendingCount: 3 });
    expect(screen.getByText("⚠ 3 leaves pending approval")).toBeInTheDocument();
  });

  it("calls onPendingClick on click and on Enter/Space", () => {
    const onPendingClick = vi.fn();
    renderSection({ pendingCount: 2, onPendingClick });
    fireEvent.click(screen.getByRole("button"));
    expect(onPendingClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(onPendingClick).toHaveBeenCalledTimes(2);
  });
});
