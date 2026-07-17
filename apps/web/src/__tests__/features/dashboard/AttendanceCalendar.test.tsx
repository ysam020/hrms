import { render, screen, fireEvent } from "@testing-library/react";
import dayjs from "dayjs";
import AttendanceCalendar from "@web/features/dashboard/AttendanceCalendar";
import { useDashboard } from "@web/app/providers/DashboardContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@web/app/providers/DashboardContext", () => ({
  useDashboard: vi.fn(),
}));
const mockUseDashboard = useDashboard as unknown as ReturnType<typeof vi.fn>;

const today = dayjs();
const todayStr = today.format("YYYY-MM-DD");

function renderWith(attendances: any[], loading = false) {
  mockUseDashboard.mockReturnValue({
    data: { attendances },
    loading: { attendances: loading },
  });
  return render(<AttendanceCalendar />);
}

describe("AttendanceCalendar", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("shows skeletons while loading", () => {
    const { container } = renderWith([], true);
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  it("shows the current month and year", () => {
    renderWith([]);
    expect(screen.getByText(today.format("MMMM YYYY"))).toBeInTheDocument();
  });

  it("shows a worked-minutes badge when both check-in and check-out are recorded", () => {
    renderWith([
      {
        date: todayStr,
        timeIn: `${todayStr}T09:00:00`,
        timeOut: `${todayStr}T17:30:00`,
      },
    ]);
    expect(screen.getByText("510")).toBeInTheDocument();
  });

  it.each([
    ["leave", "L"],
    ["half-day", "H"],
    ["week-off", "W"],
    ["holiday", "H"],
    ["present", "P"],
  ])(
    "shows a '%s' badge as '%s' when there is no complete check-in/out",
    (status, label) => {
      renderWith([{ date: todayStr, status }]);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it("shows no badge for a day with an unrecognised status", () => {
    renderWith([{ date: todayStr, status: "unknown-status" }]);
    expect(
      screen.getByLabelText(
        new RegExp(`^${today.format("ddd")} ${today.date()}$`),
      ),
    ).toBeInTheDocument();
  });

  it("navigates to full attendance view on 'View full' click", () => {
    renderWith([]);
    fireEvent.click(screen.getByText("View full →"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/attendance/view-all-attendances",
    );
  });

  it("navigates to full attendance view on clicking a day cell", () => {
    renderWith([]);
    const todayCell = screen.getByLabelText(
      new RegExp(`^${today.format("ddd")} ${today.date()}`),
    );
    fireEvent.click(todayCell);
    expect(mockNavigate).toHaveBeenCalledWith(
      "/attendance/view-all-attendances",
    );
  });
});
