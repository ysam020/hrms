import { render, screen } from "@testing-library/react";
import dayjs from "dayjs";
import { UpcomingEventsSection } from "@web/features/dashboard/my-workspace/UpcomingEventsSection";

describe("UpcomingEventsSection", () => {
  it("shows loading skeletons while loading", () => {
    const { container } = render(
      <UpcomingEventsSection loading={true} upcoming={[]} />,
    );
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  it("shows an empty-state message when there is nothing upcoming", () => {
    render(<UpcomingEventsSection loading={false} upcoming={[]} />);
    expect(screen.getByText("Nothing scheduled soon")).toBeInTheDocument();
  });

  it("labels a same-day item as Today and a next-day item as Tomorrow", () => {
    render(
      <UpcomingEventsSection
        loading={false}
        upcoming={[
          {
            date: dayjs().format("YYYY-MM-DD"),
            label: "Team standup",
            type: "event",
          },
          {
            date: dayjs().add(1, "day").format("YYYY-MM-DD"),
            label: "Diwali",
            type: "holiday",
          },
        ]}
      />,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("formats a further-out date as DD MMM", () => {
    const farDate = dayjs().add(10, "day");
    render(
      <UpcomingEventsSection
        loading={false}
        upcoming={[
          {
            date: farDate.format("YYYY-MM-DD"),
            label: "Annual day",
            type: "event",
          },
        ]}
      />,
    );
    expect(screen.getByText(farDate.format("DD MMM"))).toBeInTheDocument();
  });

  it("shows the optional description and time when present", () => {
    render(
      <UpcomingEventsSection
        loading={false}
        upcoming={[
          {
            date: dayjs().format("YYYY-MM-DD"),
            label: "1:1 with manager",
            type: "event",
            description: "Weekly sync",
            time: "3:00 PM",
          },
        ]}
      />,
    );
    expect(screen.getByText("Weekly sync")).toBeInTheDocument();
    expect(screen.getByText("3:00 PM")).toBeInTheDocument();
  });
});
