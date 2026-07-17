import { render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import UpcomingHolidays from "@web/features/dashboard/UpcomingHolidays";
import { useDashboard } from "@web/app/providers/DashboardContext";

vi.mock("@web/app/providers/DashboardContext", () => ({
  useDashboard: vi.fn(),
}));
const mockUseDashboard = useDashboard as unknown as ReturnType<typeof vi.fn>;

function renderWith(holidays: any[], loading = false) {
  mockUseDashboard.mockReturnValue({
    data: { holidays },
    loading: { holidays: loading },
  });
  return render(<UpcomingHolidays />);
}

describe("UpcomingHolidays", () => {
  it("shows loading skeletons", () => {
    const { container } = renderWith([], true);
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  it("shows an empty-state message when there are no upcoming holidays", () => {
    renderWith([]);
    expect(
      screen.getByText("No upcoming holidays this year"),
    ).toBeInTheDocument();
  });

  it("filters out past holidays and sorts the rest chronologically", () => {
    renderWith([
      {
        name: "Past Holiday",
        date: dayjs().subtract(5, "day").format("YYYY-MM-DD"),
      },
      {
        name: "Later Holiday",
        date: dayjs().add(10, "day").format("YYYY-MM-DD"),
      },
      {
        name: "Sooner Holiday",
        date: dayjs().add(2, "day").format("YYYY-MM-DD"),
      },
    ]);
    expect(screen.queryByText("Past Holiday")).not.toBeInTheDocument();
    const names = screen.getAllByText(/Holiday$/).map((el) => el.textContent);
    expect(names).toEqual(["Sooner Holiday", "Later Holiday"]);
  });

  it("caps the list at 8 upcoming holidays and shows the count chip", () => {
    const holidays = Array.from({ length: 10 }, (_, i) => ({
      name: `Holiday ${i}`,
      date: dayjs()
        .add(i + 1, "day")
        .format("YYYY-MM-DD"),
    }));
    renderWith(holidays);
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.queryByText("Holiday 8")).not.toBeInTheDocument();
    expect(screen.queryByText("Holiday 9")).not.toBeInTheDocument();
  });

  it("labels a today holiday as 'Today!' and tomorrow's as 'Tomorrow'", () => {
    renderWith([
      { name: "Today Holiday", date: dayjs().format("YYYY-MM-DD") },
      {
        name: "Tomorrow Holiday",
        date: dayjs().add(1, "day").format("YYYY-MM-DD"),
      },
    ]);
    expect(screen.getByText(/Today!/)).toBeInTheDocument();
    const tomorrowWeekday = dayjs().add(1, "day").format("dddd");
    expect(
      screen.getByText(
        (_, el) => el?.textContent === `${tomorrowWeekday} · Tomorrow`,
      ),
    ).toBeInTheDocument();
  });

  it("falls back to 'title' then 'Holiday' when 'name' is missing", () => {
    renderWith([
      { title: "Titled Holiday", date: dayjs().format("YYYY-MM-DD") },
    ]);
    expect(screen.getByText("Titled Holiday")).toBeInTheDocument();
  });

  it("falls back to a generic 'Holiday' label when both name and title are missing", () => {
    renderWith([{ date: dayjs().format("YYYY-MM-DD") }]);
    expect(screen.getByText("Holiday")).toBeInTheDocument();
  });
});
