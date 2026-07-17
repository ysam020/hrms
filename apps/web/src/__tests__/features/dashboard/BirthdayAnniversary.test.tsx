import { render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import BirthdayAnniversary from "@web/features/dashboard/BirthdayAnniversary";
import { useDashboard } from "@web/app/providers/DashboardContext";

vi.mock("@web/app/providers/DashboardContext", () => ({
  useDashboard: vi.fn(),
}));
const mockUseDashboard = useDashboard as unknown as ReturnType<typeof vi.fn>;

const todayDay = dayjs().date();

function renderWith(items: any[], loading = false) {
  mockUseDashboard.mockReturnValue({
    data: { birthdaysAnniversaries: items },
    loading: { birthdaysAnniversaries: loading },
  });
  return render(<BirthdayAnniversary />);
}

describe("BirthdayAnniversary", () => {
  it("shows loading skeletons", () => {
    const { container } = renderWith([], true);
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  it("shows an empty-state message when there is nothing this month", () => {
    renderWith([]);
    expect(screen.getByText("Nothing this month")).toBeInTheDocument();
  });

  it("renders a birthday entry with initials, name, and department", () => {
    renderWith([
      {
        name: "Jane Doe",
        username: "jdoe",
        department: "Engineering",
        type: "birthday",
        day: todayDay,
      },
    ]);
    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Engineering · Birthday")).toBeInTheDocument();
  });

  it("renders an anniversary entry with years of service", () => {
    renderWith([
      {
        name: "John Smith",
        username: "jsmith",
        type: "anniversary",
        years: 5,
        day: todayDay,
      },
    ]);
    expect(screen.getByText("5yr anniversary")).toBeInTheDocument();
    expect(screen.getByText("Anniv.")).toBeInTheDocument();
  });

  it("shows a 'today' count chip and labels today's entries as Today", () => {
    renderWith([
      { name: "Jane Doe", username: "jdoe", type: "birthday", day: todayDay },
    ]);
    expect(screen.getByText("🎉 1 today")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows the total count chip but no 'today' chip when nothing is today", () => {
    const futureDay = todayDay < 28 ? todayDay + 2 : 1;
    renderWith([
      { name: "Jane Doe", username: "jdoe", type: "birthday", day: futureDay },
    ]);
    expect(screen.queryByText(/today$/)).not.toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("orders entries as today, then upcoming, then past", () => {
    const past = todayDay > 1 ? todayDay - 1 : null;
    const future = todayDay < 28 ? todayDay + 1 : null;
    if (!past || !future) return; // skip near month boundaries — see date-dependent test note

    renderWith([
      { name: "Past Person", username: "past", type: "birthday", day: past },
      {
        name: "Future Person",
        username: "future",
        type: "birthday",
        day: future,
      },
      {
        name: "Today Person",
        username: "today",
        type: "birthday",
        day: todayDay,
      },
    ]);
    const names = screen.getAllByText(/Person$/).map((el) => el.textContent);
    expect(names).toEqual(["Today Person", "Future Person", "Past Person"]);
  });

  it("labels a day one greater than today as Tomorrow", () => {
    if (todayDay >= 28) return; // skip near month boundaries — see date-dependent test note
    renderWith([
      {
        name: "Jane Doe",
        username: "jdoe",
        type: "birthday",
        day: todayDay + 1,
      },
    ]);
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });
});
