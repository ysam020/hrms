import { render, screen, fireEvent } from "@testing-library/react";
import { QuickActionsSection } from "@web/features/dashboard/my-workspace/QuickActionsSection";

describe("QuickActionsSection", () => {
  it("renders all six quick actions", () => {
    render(
      <QuickActionsSection
        borderColor="#eee"
        isDark={false}
        onNavigate={vi.fn()}
      />,
    );
    [
      "Apply Leave",
      "My Payslips",
      "My Profile",
      "Calendar",
      "Attendance",
      "KYC",
    ].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it("navigates to the correct path when an action is clicked", () => {
    const onNavigate = vi.fn();
    render(
      <QuickActionsSection
        borderColor="#eee"
        isDark={false}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.click(screen.getByText("My Profile"));
    expect(onNavigate).toHaveBeenCalledWith("/profile");
  });
});
