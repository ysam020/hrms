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
      loading={false}
      onBack={onBack}
      onPayAndCreate={onPayAndCreate}
      {...overrides}
    />,
  );
  return { setBilling, onPayAndCreate, onBack };
}

describe("PlanStep", () => {
  it("shows the monthly price and no savings note by default", () => {
    renderStep({ billing: "monthly" });
    expect(screen.getByText("₹999")).toBeInTheDocument();
    expect(screen.getByText("per month")).toBeInTheDocument();
    expect(screen.queryByText(/Save/)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pay ₹999 & Continue" }),
    ).toBeInTheDocument();
  });

  it("shows the annual price with a savings note", () => {
    renderStep({ billing: "annual" });
    expect(screen.getByText("₹9,999")).toBeInTheDocument();
    expect(screen.getByText("per year")).toBeInTheDocument();
    expect(screen.getByText("Save ₹2,989 (25%)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pay ₹9,999 & Continue" }),
    ).toBeInTheDocument();
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
      screen.getByRole("button", { name: "Pay ₹999 & Continue" }),
    );
    expect(onPayAndCreate).toHaveBeenCalled();
  });
});
