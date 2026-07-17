import { render, screen } from "@testing-library/react";
import { AttendanceCard } from "@web/features/dashboard/mark-attendance/AttendanceCard";

function renderCard(
  overrides: Partial<React.ComponentProps<typeof AttendanceCard>> = {},
) {
  return render(
    <AttendanceCard
      status={{ text: "Checked In", color: "success" }}
      disableFields={{ timeIn: false, timeOut: false }}
      dialogOpen={false}
      handleAttendance={vi.fn()}
      modelsLoading={false}
      isInitialLoading={false}
      {...overrides}
    />,
  );
}

describe("AttendanceCard", () => {
  it("shows a status skeleton while initially loading", () => {
    const { container } = renderCard({ isInitialLoading: true });
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
    expect(screen.queryByText("Checked In")).not.toBeInTheDocument();
  });

  it("shows the status chip once loaded", () => {
    renderCard();
    expect(screen.getByText("Checked In")).toBeInTheDocument();
  });

  it("renders the attendance action buttons", () => {
    renderCard();
    expect(screen.getByText("Punch In")).toBeInTheDocument();
  });
});
