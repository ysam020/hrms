import { render, screen, fireEvent } from "@testing-library/react";
import { HrSection } from "@web/features/settings/org-settings/HrSection";
import { SCHEMA_DEFAULTS } from "@web/features/settings/org-settings/types";

function renderSection(onChange = vi.fn(), readOnly = false) {
  render(
    <HrSection
      settings={SCHEMA_DEFAULTS}
      onChange={onChange}
      readOnly={readOnly}
    />,
  );
  return { onChange };
}

describe("HrSection", () => {
  it("shows the current values", () => {
    renderSection();
    expect(screen.getByLabelText("Probation period")).toHaveValue(90);
    expect(screen.getByLabelText("Notice period")).toHaveValue(30);
    expect(screen.getByLabelText("Max interview rounds")).toHaveValue(5);
  });

  it("calls onChange with the new probation period", () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText("Probation period"), {
      target: { value: "60" },
    });
    expect(onChange).toHaveBeenCalledWith({ probationPeriodDays: 60 });
  });

  it("clamps a negative notice period to 0", () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText("Notice period"), {
      target: { value: "-5" },
    });
    expect(onChange).toHaveBeenCalledWith({ noticePeriodDays: 0 });
  });

  it("clamps interview rounds to a minimum of 1, not 0", () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText("Max interview rounds"), {
      target: { value: "0" },
    });
    expect(onChange).toHaveBeenCalledWith({ maxInterviewRounds: 1 });
  });

  it("disables all fields when read-only", () => {
    renderSection(vi.fn(), true);
    expect(screen.getByLabelText("Probation period")).toBeDisabled();
    expect(screen.getByLabelText("Notice period")).toBeDisabled();
    expect(screen.getByLabelText("Max interview rounds")).toBeDisabled();
  });
});
