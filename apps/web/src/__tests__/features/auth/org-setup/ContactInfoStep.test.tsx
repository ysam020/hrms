import { render, screen, fireEvent } from "@testing-library/react";
import { ContactInfoStep } from "@web/features/auth/org-setup/ContactInfoStep";

function renderStep(
  overrides: Partial<React.ComponentProps<typeof ContactInfoStep>> = {},
) {
  const onSkip = vi.fn();
  const onSaveAndContinue = vi.fn();
  const setHelpPhone = vi.fn();
  render(
    <ContactInfoStep
      helpPhone=""
      setHelpPhone={setHelpPhone}
      helpEmail=""
      setHelpEmail={vi.fn()}
      officeAddress=""
      setOfficeAddress={vi.fn()}
      workState=""
      setWorkState={vi.fn()}
      website=""
      setWebsite={vi.fn()}
      loading={false}
      onSkip={onSkip}
      onSaveAndContinue={onSaveAndContinue}
      {...overrides}
    />,
  );
  return { onSkip, onSaveAndContinue, setHelpPhone };
}

describe("ContactInfoStep", () => {
  it("calls onSkip and onSaveAndContinue", () => {
    const { onSkip, onSaveAndContinue } = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onSaveAndContinue).toHaveBeenCalled();
  });

  it("disables both buttons while loading", () => {
    renderStep({ loading: true });
    expect(screen.getByRole("button", { name: "Skip" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Save & Continue" }),
    ).toBeDisabled();
  });

  it("wires field changes back to their setters", () => {
    const { setHelpPhone } = renderStep();
    fireEvent.change(screen.getByLabelText("Help phone number"), {
      target: { value: "+91 90000 00000" },
    });
    expect(setHelpPhone).toHaveBeenCalledWith("+91 90000 00000");
  });
});
