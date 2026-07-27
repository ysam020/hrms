import { render, screen, fireEvent } from "@testing-library/react";
import { PlanStep } from "@web/features/auth/org-setup/PlanStep";

function renderStep(
  overrides: Partial<React.ComponentProps<typeof PlanStep>> = {},
) {
  const setBilling = vi.fn();
  const onPayAndCreate = vi.fn();
  const onBack = vi.fn();
  render(
    <PlanStep
      billing="monthly"
      setBilling={setBilling}
      planTier="starter"
      loading={false}
      onBack={onBack}
      onPayAndCreate={onPayAndCreate}
      {...overrides}
    />,
  );
  return { setBilling, onPayAndCreate, onBack };
}

describe("PlanStep", () => {
  it("shows the starter monthly price and no savings note by default", () => {
    renderStep({ planTier: "starter", billing: "monthly" });
    expect(screen.getByText("₹7,999")).toBeInTheDocument();
    expect(screen.getByText("per month")).toBeInTheDocument();
    expect(screen.queryByText(/Save/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pay ₹7,999 & Continue" }),
    ).toBeInTheDocument();
  });

  it("shows the starter annual price with a savings note", () => {
    renderStep({ planTier: "starter", billing: "annual" });
    expect(screen.getByText("₹86,389.2")).toBeInTheDocument();
    expect(screen.getByText("per year")).toBeInTheDocument();
    expect(screen.getByText("Save 10% vs. monthly")).toBeInTheDocument();
  });

  it("shows the growth tier's price and employee cap", () => {
    renderStep({ planTier: "growth", billing: "monthly" });
    expect(screen.getByText("₹14,999")).toBeInTheDocument();
    expect(screen.getByText("Up to 100 employees")).toBeInTheDocument();
    expect(screen.getByText("HRMS Growth")).toBeInTheDocument();
  });

  it("shows the enterprise tier as unlimited", () => {
    renderStep({ planTier: "enterprise", billing: "monthly" });
    expect(screen.getByText("₹29,999")).toBeInTheDocument();
    expect(screen.getByText("Unlimited employees")).toBeInTheDocument();
    expect(screen.getByText("HRMS Enterprise")).toBeInTheDocument();
  });

  it("shows the starter tier's employee cap in its feature list", () => {
    renderStep({ planTier: "starter" });
    expect(screen.getByText("Up to 25 employees")).toBeInTheDocument();
  });

  it("does not expose a tier toggle — planTier is decided by the previous step", () => {
    renderStep({ planTier: "starter" });
    expect(
      screen.queryByRole("button", { name: /Growth/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enterprise/ }),
    ).not.toBeInTheDocument();
  });

  it("switches billing when the toggle is clicked", () => {
    const { setBilling } = renderStep({ billing: "monthly" });
    fireEvent.click(screen.getByRole("button", { name: "Annual" }));
    expect(setBilling).toHaveBeenCalledWith("annual");
  });

  it("disables Back and Pay while loading", () => {
    renderStep({ loading: true });
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Pay/ })).toBeDisabled();
  });

  it("calls onBack and onPayAndCreate", () => {
    const { onBack, onPayAndCreate } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Pay ₹7,999 & Continue" }),
    );
    expect(onPayAndCreate).toHaveBeenCalled();
  });
});
