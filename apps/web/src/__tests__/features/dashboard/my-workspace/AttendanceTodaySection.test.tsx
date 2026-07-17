import { render, screen } from "@testing-library/react";
import { AttendanceTodaySection } from "@web/features/dashboard/my-workspace/AttendanceTodaySection";

vi.mock("@web/features/dashboard/MarkAttendance", () => ({
  default: () => <div>Stub MarkAttendance</div>,
}));

function renderSection(
  overrides: Partial<React.ComponentProps<typeof AttendanceTodaySection>> = {},
) {
  return render(
    <AttendanceTodaySection
      isDark={false}
      borderColor="#eee"
      loadingAttendances={false}
      todayRecord={null}
      workingHoursToday={null}
      {...overrides}
    />,
  );
}

describe("AttendanceTodaySection", () => {
  it("shows a loading skeleton for the in/out times while loading", () => {
    const { container } = renderSection({ loadingAttendances: true });
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows dashes when there is no check-in/check-out yet", () => {
    renderSection({ todayRecord: null });
    expect(screen.getAllByText("—")).toHaveLength(2);
  });

  it("formats the check-in and check-out times", () => {
    renderSection({
      todayRecord: {
        checkIn: "2024-06-01T09:30:00Z",
        checkOut: "2024-06-01T18:00:00Z",
      },
    });
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("shows the working-hours-today summary only when provided", () => {
    const { rerender } = renderSection({ workingHoursToday: null });
    expect(screen.queryByText(/worked today/)).not.toBeInTheDocument();

    rerender(
      <AttendanceTodaySection
        isDark={false}
        borderColor="#eee"
        loadingAttendances={false}
        todayRecord={null}
        workingHoursToday="7h 30m"
      />,
    );
    expect(screen.getByText("⏱ 7h 30m worked today")).toBeInTheDocument();
  });
});
