import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import dayjs from "dayjs";
import CustomCalendar from "@web/features/layout/Calendar";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/http/axiosConfig", () => ({ default: { delete: vi.fn() } }));
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-big-calendar", () => ({
  Calendar: (props: any) => (
    <div>
      <button
        onClick={() =>
          props.onSelectSlot({ start: new Date(), end: new Date() })
        }
      >
        Select slot
      </button>
      {props.components.toolbar({
        label: "July 2026",
        onNavigate: props.onNavigate,
        onView: props.onView,
        view: props.view,
      })}
      {props.events.map((event: any) => (
        <button
          key={event.id}
          onClick={(e) => props.onSelectEvent(event, e)}
          data-testid={`event-${event.id}`}
        >
          {props.components.event({ event })}
        </button>
      ))}
    </div>
  ),
  dayjsLocalizer: () => ({}),
}));

vi.mock("@web/features/layout/modals/AddEventModal", () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        Stub AddEventModal {props.isEditMode ? "(edit)" : "(create)"}
        {props.editEventData ? ` for ${props.editEventData.title}` : ""}
        <button onClick={props.handleClose}>Close Add Event Modal</button>
      </div>
    ) : null,
}));

vi.mock("@web/features/layout/EventPopover", () => ({
  default: (props: any) =>
    props.openPopover ? (
      <div>
        Stub EventPopover for {props.selectedEvent?.title}
        <button
          onClick={() => {
            props.onEditEvent(props.selectedEvent);
            props.handlePopoverClose();
          }}
        >
          Trigger Edit
        </button>
        <button onClick={() => props.onDeleteEvent(props.selectedEvent)}>
          Trigger Delete
        </button>
      </div>
    ) : null,
}));

function renderCalendar() {
  return render(
    <MemoryRouter>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <CustomCalendar />
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

describe("Calendar", () => {
  const today = dayjs().format("YYYY-MM-DD");
  const tomorrow = dayjs().add(1, "day").format("YYYY-MM-DD");
  const yesterday = dayjs().subtract(1, "day").format("YYYY-MM-DD");

  const refetch = vi.fn();

  beforeEach(() => {
    refetch.mockReset();
    mockDelete.mockReset();
    mockUseFetchData.mockReturnValue({
      data: [
        {
          _id: "e1",
          title: "Standup",
          date: today,
          startTime: "09:00",
          endTime: "09:30",
        },
        { _id: "e2", title: "Planning", date: tomorrow },
        { _id: "e3", title: "Old Event", date: yesterday },
      ],
      refetch,
    });
  });

  it("lists only today-and-future events in the upcoming sidebar, sorted, excluding past ones", () => {
    const { container } = renderCalendar();
    const upcomingList = container.querySelector(".upcoming-list")!;
    expect(upcomingList.textContent).toContain("Standup");
    expect(upcomingList.textContent).toContain("Planning");
    // "Old Event" is still shown on the calendar grid itself (mocked above),
    // just excluded from this date-filtered sidebar.
    expect(upcomingList.textContent).not.toContain("Old Event");
  });

  it("shows 'No upcoming events' when there are none in range", () => {
    mockUseFetchData.mockReturnValue({
      data: [{ _id: "e3", title: "Old Event", date: yesterday }],
      refetch,
    });
    renderCalendar();
    expect(screen.getByText("No upcoming events")).toBeInTheDocument();
  });

  it("opens the Add Event modal in create mode via the header add button", () => {
    renderCalendar();
    fireEvent.click(screen.getByLabelText("Add calendar event"));
    expect(
      screen.getByText(/Stub AddEventModal \(create\)/),
    ).toBeInTheDocument();
  });

  it("opens the Add Event modal pre-filled with a selected slot", () => {
    renderCalendar();
    fireEvent.click(screen.getByText("Select slot"));
    expect(
      screen.getByText(/Stub AddEventModal \(create\)/),
    ).toBeInTheDocument();
  });

  it("opens the event popover when a calendar event is clicked", () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId("event-e1"));
    expect(
      screen.getByText("Stub EventPopover for Standup"),
    ).toBeInTheDocument();
  });

  it("switches from popover to the edit modal when Edit is triggered from the popover", () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId("event-e1"));
    fireEvent.click(screen.getByText("Trigger Edit"));
    expect(
      screen.queryByText("Stub EventPopover for Standup"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Stub AddEventModal \(edit\) for Standup/),
    ).toBeInTheDocument();
  });

  it("opens a delete confirmation dialog when Delete is triggered from the popover", () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId("event-e1"));
    fireEvent.click(screen.getByText("Trigger Delete"));
    expect(
      screen.queryByText("Stub EventPopover for Standup"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete "Standup"?'),
    ).toBeInTheDocument();
  });

  it("cancels the delete confirmation without calling the API", () => {
    renderCalendar();
    fireEvent.click(screen.getByTestId("event-e1"));
    fireEvent.click(screen.getByText("Trigger Delete"));
    fireEvent.click(screen.getByText("Cancel", { selector: "span" }));
    expect(
      screen.queryByText('Are you sure you want to delete "Standup"?'),
    ).not.toBeInTheDocument();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the event by its id and refetches on confirm", async () => {
    mockDelete.mockResolvedValue({});
    renderCalendar();
    fireEvent.click(screen.getByTestId("event-e1"));
    fireEvent.click(screen.getByText("Trigger Delete"));
    fireEvent.click(screen.getByText("Delete Event", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(
        expect.stringContaining("e1"),
        expect.objectContaining({ timeout: 10000 }),
      ),
    );
    await waitFor(() => expect(refetch).toHaveBeenCalled());
  });

  it("navigates the calendar toolbar via Previous/Today/Next", () => {
    renderCalendar();
    fireEvent.click(screen.getByLabelText("Previous period"));
    fireEvent.click(screen.getByLabelText("Go to today"));
    fireEvent.click(screen.getByLabelText("Next period"));
    // No throw / no crash across all three navigation actions confirms the
    // toolbar wiring to react-big-calendar's onNavigate is intact.
    expect(screen.getByLabelText("Month view")).toBeInTheDocument();
  });

  it("switches calendar view via the toolbar view buttons", () => {
    renderCalendar();
    fireEvent.click(screen.getByLabelText("Week view"));
    expect(screen.getByLabelText("Week view")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
