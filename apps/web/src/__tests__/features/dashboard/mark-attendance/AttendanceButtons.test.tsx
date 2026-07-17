import { render, screen, fireEvent } from "@testing-library/react";
import { AttendanceButtons } from "@web/features/dashboard/mark-attendance/AttendanceButtons";

function renderButtons(
  overrides: Partial<React.ComponentProps<typeof AttendanceButtons>> = {},
) {
  const handleAttendance = vi.fn();
  const view = render(
    <AttendanceButtons
      disableFields={{ timeIn: false, timeOut: false }}
      dialogOpen={false}
      modelsLoading={false}
      handleAttendance={handleAttendance}
      isInitialLoading={false}
      {...overrides}
    />,
  );
  return { handleAttendance, container: view.container };
}

describe("AttendanceButtons", () => {
  it("shows skeletons while initially loading", () => {
    const { container } = renderButtons({ isInitialLoading: true });
    expect(container.querySelectorAll(".MuiSkeleton-root").length).toBe(2);
    expect(screen.queryByText("Punch In")).not.toBeInTheDocument();
  });

  it("shows Punch In before check-in", () => {
    renderButtons({ disableFields: { timeIn: false, timeOut: false } });
    expect(screen.getByText("Punch In")).toBeInTheDocument();
    expect(screen.queryByText("Punch Out")).not.toBeInTheDocument();
  });

  it("shows Punch Out after check-in but before check-out", () => {
    renderButtons({ disableFields: { timeIn: true, timeOut: false } });
    expect(screen.getByText("Punch Out")).toBeInTheDocument();
    expect(screen.queryByText("Punch In")).not.toBeInTheDocument();
  });

  it("shows neither button once both are recorded", () => {
    renderButtons({ disableFields: { timeIn: true, timeOut: true } });
    expect(screen.queryByText("Punch In")).not.toBeInTheDocument();
    expect(screen.queryByText("Punch Out")).not.toBeInTheDocument();
  });

  it("calls handleAttendance('timeIn') when Punch In is clicked", () => {
    const { handleAttendance } = renderButtons();
    fireEvent.click(screen.getByText("Punch In"));
    expect(handleAttendance).toHaveBeenCalledWith("timeIn");
  });

  it("calls handleAttendance('timeOut') when Punch Out is clicked", () => {
    const { handleAttendance } = renderButtons({
      disableFields: { timeIn: true, timeOut: false },
    });
    fireEvent.click(screen.getByText("Punch Out"));
    expect(handleAttendance).toHaveBeenCalledWith("timeOut");
  });

  it("disables the button while the dialog is open or models are loading", () => {
    renderButtons({ dialogOpen: true });
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
