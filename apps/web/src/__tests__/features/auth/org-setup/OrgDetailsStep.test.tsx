import { render, screen, fireEvent } from "@testing-library/react";
import { OrgDetailsStep } from "@web/features/auth/org-setup/OrgDetailsStep";

function renderStep(
  overrides: Partial<React.ComponentProps<typeof OrgDetailsStep>> = {},
) {
  const onContinue = vi.fn();
  const setOrgName = vi.fn();
  render(
    <OrgDetailsStep
      orgName=""
      setOrgName={setOrgName}
      industry=""
      setIndustry={vi.fn()}
      companySize=""
      setCompanySize={vi.fn()}
      workWeek={{ days: [], type: "all" } as any}
      setWorkWeek={vi.fn()}
      onContinue={onContinue}
      {...overrides}
    />,
  );
  return { onContinue, setOrgName };
}

describe("OrgDetailsStep", () => {
  it("disables Continue until an organisation name is entered", () => {
    renderStep({ orgName: "" });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("disables Continue when the name is only whitespace", () => {
    renderStep({ orgName: "   " });
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("enables Continue once a non-empty name is present", () => {
    renderStep({ orgName: "Acme Corp" });
    expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();
  });

  it("submits on Enter when the name is non-empty", () => {
    const { onContinue } = renderStep({ orgName: "Acme Corp" });
    fireEvent.keyDown(screen.getByLabelText("Organisation name"), {
      key: "Enter",
    });
    expect(onContinue).toHaveBeenCalled();
  });

  it("does not submit on Enter when the name is empty", () => {
    const { onContinue } = renderStep({ orgName: "" });
    fireEvent.keyDown(screen.getByLabelText("Organisation name"), {
      key: "Enter",
    });
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("calls setOrgName as the user types", () => {
    const { setOrgName } = renderStep();
    fireEvent.change(screen.getByLabelText("Organisation name"), {
      target: { value: "New Co" },
    });
    expect(setOrgName).toHaveBeenCalledWith("New Co");
  });
});
