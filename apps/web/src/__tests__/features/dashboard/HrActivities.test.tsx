import { render, screen } from "@testing-library/react";
import HrActivities from "@web/features/dashboard/HrActivities";
import { useDashboard } from "@web/app/providers/DashboardContext";

vi.mock("@web/app/providers/DashboardContext", () => ({
  useDashboard: vi.fn(),
}));
const mockUseDashboard = useDashboard as unknown as ReturnType<typeof vi.fn>;

describe("HrActivities", () => {
  it("shows the empty message when there are no activities", () => {
    mockUseDashboard.mockReturnValue({
      data: { hrActivities: [] },
      loading: { hrActivities: false },
    });
    render(<HrActivities />);
    expect(screen.getByText("No activities found")).toBeInTheDocument();
  });

  it("renders each activity's title, description, date, and time", () => {
    mockUseDashboard.mockReturnValue({
      data: {
        hrActivities: [
          {
            title: "New hire onboarded",
            description: "Welcome John",
            date: "2024-06-05",
            time: "10:00 AM",
          },
        ],
      },
      loading: { hrActivities: false },
    });
    render(<HrActivities />);
    expect(screen.getByText("New hire onboarded")).toBeInTheDocument();
    expect(screen.getByText("Welcome John")).toBeInTheDocument();
    expect(screen.getByText("05-06-2024")).toBeInTheDocument();
    expect(screen.getByText("10:00 AM")).toBeInTheDocument();
  });

  it("handles a missing or malformed date gracefully", () => {
    mockUseDashboard.mockReturnValue({
      data: {
        hrActivities: [
          { title: "Event", description: "", date: null, time: "" },
        ],
      },
      loading: { hrActivities: false },
    });
    render(<HrActivities />);
    expect(screen.getByText("Event")).toBeInTheDocument();
  });
});
