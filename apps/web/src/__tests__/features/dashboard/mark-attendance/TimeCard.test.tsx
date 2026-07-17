import { render, screen } from "@testing-library/react";
import { TimeCard } from "@web/features/dashboard/mark-attendance/TimeCard";

const COLOR_SCHEME = { color: "#2e7d32", border: "1px solid green" };

describe("TimeCard", () => {
  it("shows skeletons while initially loading", () => {
    const { container } = render(
      <TimeCard
        label="Time In"
        time={undefined}
        loading={true}
        colorScheme={COLOR_SCHEME}
        isInitialLoading={true}
      />,
    );
    expect(container.querySelectorAll(".MuiSkeleton-root").length).toBe(2);
    expect(screen.queryByText("Time In")).not.toBeInTheDocument();
  });

  it("shows a placeholder skeleton for the time value while it's loading (but not initial)", () => {
    const { container } = render(
      <TimeCard
        label="Time In"
        time={undefined}
        loading={true}
        colorScheme={COLOR_SCHEME}
        isInitialLoading={false}
      />,
    );
    expect(screen.getByText("Time In")).toBeInTheDocument();
    expect(container.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
  });

  it("shows the formatted time once available", () => {
    render(
      <TimeCard
        label="Time In"
        time="09:15 AM"
        loading={false}
        colorScheme={COLOR_SCHEME}
        isInitialLoading={false}
      />,
    );
    expect(screen.getByText("09:15 AM")).toBeInTheDocument();
  });

  it("shows a placeholder dash when there is no time and it's not loading", () => {
    render(
      <TimeCard
        label="Time Out"
        time={undefined}
        loading={false}
        colorScheme={COLOR_SCHEME}
        isInitialLoading={false}
      />,
    );
    expect(screen.getByText("--:--")).toBeInTheDocument();
  });
});
