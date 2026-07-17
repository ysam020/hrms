import { render, screen, fireEvent } from "@testing-library/react";
import { JoinRequestPending } from "@web/features/auth/org-setup/JoinRequestPending";

describe("JoinRequestPending", () => {
  it("shows the tenant name in the pending message", () => {
    render(
      <JoinRequestPending
        tenantName="Acme Corp"
        checkingDomain={false}
        onCheckAgain={vi.fn()}
      />,
    );
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("disables Check again while checkingDomain is true", () => {
    render(
      <JoinRequestPending
        tenantName="Acme Corp"
        checkingDomain={true}
        onCheckAgain={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Check again" })).toBeDisabled();
  });

  it("calls onCheckAgain when clicked", () => {
    const onCheckAgain = vi.fn();
    render(
      <JoinRequestPending
        tenantName="Acme Corp"
        checkingDomain={false}
        onCheckAgain={onCheckAgain}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(onCheckAgain).toHaveBeenCalled();
  });
});
