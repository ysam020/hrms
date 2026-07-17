import { render, screen, fireEvent } from "@testing-library/react";
import { AttendanceSection } from "@web/features/settings/org-settings/AttendanceSection";
import { SCHEMA_DEFAULTS } from "@web/features/settings/org-settings/types";

function renderSection(
  overrides: Partial<any> = {},
  onChange = vi.fn(),
  readOnly = false,
) {
  render(
    <AttendanceSection
      settings={{ ...SCHEMA_DEFAULTS, ...overrides }}
      onChange={onChange}
      readOnly={readOnly}
    />,
  );
  return { onChange };
}

describe("AttendanceSection", () => {
  it("computes and shows the late threshold from start time + grace period", () => {
    renderSection({
      workStartHour: 9,
      workStartMinute: 0,
      lateGracePeriodMinutes: 30,
    });
    expect(screen.getByText("09:30")).toBeInTheDocument();
  });

  it("rolls the late threshold over into the next hour correctly", () => {
    renderSection({
      workStartHour: 9,
      workStartMinute: 45,
      lateGracePeriodMinutes: 30,
    });
    expect(screen.getByText("10:15")).toBeInTheDocument();
  });

  it("clamps the start hour to the 0-23 range", () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText("Start — hour"), {
      target: { value: "25" },
    });
    expect(onChange).toHaveBeenCalledWith({ workStartHour: 23 });

    fireEvent.change(screen.getByLabelText("Start — hour"), {
      target: { value: "-3" },
    });
    expect(onChange).toHaveBeenCalledWith({ workStartHour: 0 });
  });

  it("clamps the start minute to the 0-59 range", () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText("Start — minute"), {
      target: { value: "90" },
    });
    expect(onChange).toHaveBeenCalledWith({ workStartMinute: 59 });
  });

  it("clamps full/half day minimum hours to at least 0.5", () => {
    const { onChange } = renderSection();
    fireEvent.change(screen.getByLabelText("Full day — min hours"), {
      target: { value: "0" },
    });
    expect(onChange).toHaveBeenCalledWith({ fullDayMinHours: 0.5 });
  });

  it("toggles the overtime pre-approval switch", () => {
    const { onChange } = renderSection({ overtimePreApprovalRequired: false });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Require overtime pre-approval/ }),
    );
    expect(onChange).toHaveBeenCalledWith({
      overtimePreApprovalRequired: true,
    });
  });

  it("disables every field when read-only", () => {
    renderSection({}, vi.fn(), true);
    expect(screen.getByLabelText("Start — hour")).toBeDisabled();
    expect(screen.getByLabelText("Regularization window")).toBeDisabled();
    expect(
      screen.getByRole("checkbox", { name: /Require overtime pre-approval/ }),
    ).toBeDisabled();
  });
});
