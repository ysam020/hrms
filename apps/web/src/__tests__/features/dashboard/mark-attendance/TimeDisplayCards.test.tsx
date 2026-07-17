import { render, screen } from "@testing-library/react";
import { TimeDisplayCards } from "@web/features/dashboard/mark-attendance/TimeDisplayCards";

describe("TimeDisplayCards", () => {
  it("renders both Time In and Time Out cards", () => {
    render(
      <TimeDisplayCards
        loading={false}
        todayTimeIn="09:00 AM"
        todayTimeOut="06:00 PM"
        theme="light"
        isInitialLoading={false}
      />,
    );
    expect(screen.getByText("Time In")).toBeInTheDocument();
    expect(screen.getByText("Time Out")).toBeInTheDocument();
    expect(screen.getByText("09:00 AM")).toBeInTheDocument();
    expect(screen.getByText("06:00 PM")).toBeInTheDocument();
  });

  it("shows placeholders when times are not yet recorded", () => {
    render(
      <TimeDisplayCards
        loading={false}
        todayTimeIn={undefined}
        todayTimeOut={undefined}
        theme="light"
        isInitialLoading={false}
      />,
    );
    expect(screen.getAllByText("--:--")).toHaveLength(2);
  });
});
