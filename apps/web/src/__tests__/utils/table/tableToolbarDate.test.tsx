import { render, screen, fireEvent } from "@testing-library/react";
import { tableToolbarDate } from "@web/shared/utils/table/tableToolbarDate";

describe("tableToolbarDate", () => {
  it("returns a renderTopToolbarCustomActions render-prop", () => {
    const config = tableToolbarDate("2024-06", vi.fn());
    expect(config.renderTopToolbarCustomActions).toEqual(expect.any(Function));
  });

  it("renders a Calendar seeded with the given month/year", () => {
    const config = tableToolbarDate("2024-06", vi.fn());
    render(<>{config.renderTopToolbarCustomActions()}</>);
    // PrimeReact Calendar renders an input with the formatted mm/yy value.
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("06/2024");
  });

  it("renders with no value when date is empty", () => {
    const config = tableToolbarDate("", vi.fn());
    render(<>{config.renderTopToolbarCustomActions()}</>);
    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("");
  });

  it("calls setDate with 'YYYY-MM' when the user picks a month via the calendar UI", () => {
    const setDate = vi.fn();
    const config = tableToolbarDate("2024-06", setDate);
    render(<>{config.renderTopToolbarCustomActions()}</>);

    // Open the calendar panel via the icon button.
    fireEvent.click(screen.getByRole("button"));
    // The current year/month view shows month buttons — click a month cell.
    const monthButtons = document.querySelectorAll(".p-monthpicker-month");
    expect(monthButtons.length).toBeGreaterThan(0);
    fireEvent.click(monthButtons[2]); // March

    expect(setDate).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-03$/));
  });
});
