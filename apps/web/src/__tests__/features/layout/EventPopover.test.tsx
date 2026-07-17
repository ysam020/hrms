import { render, screen, fireEvent } from "@testing-library/react";
import dayjs from "dayjs";
import EventPopover from "@web/features/layout/EventPopover";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function renderWith(overrides: Partial<any> = {}) {
  const handlePopoverClose = vi.fn();
  const onEditEvent = vi.fn();
  const onDeleteEvent = vi.fn();
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <EventPopover
        openPopover={true}
        popoverAnchorEl={document.body}
        handlePopoverClose={handlePopoverClose}
        selectedEvent={{
          _id: "e1",
          title: "Standup",
          date: dayjs().format("YYYY-MM-DD"),
        }}
        onEditEvent={onEditEvent}
        onDeleteEvent={onDeleteEvent}
        {...overrides}
      />
    </ThemeContext.Provider>,
  );
  return { handlePopoverClose, onEditEvent, onDeleteEvent };
}

describe("EventPopover", () => {
  it("renders nothing when there is no selected event", () => {
    const { container } = render(
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <EventPopover
          openPopover={false}
          popoverAnchorEl={null}
          handlePopoverClose={vi.fn()}
          selectedEvent={null}
          onEditEvent={vi.fn()}
          onDeleteEvent={vi.fn()}
        />
      </ThemeContext.Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("falls back to 'Untitled Event' when the event has no title", () => {
    renderWith({
      selectedEvent: { _id: "e1", date: dayjs().format("YYYY-MM-DD") },
    });
    expect(screen.getByText("Untitled Event")).toBeInTheDocument();
  });

  it("shows 'Today' for an event dated today", () => {
    renderWith({
      selectedEvent: {
        _id: "e1",
        title: "Standup",
        date: dayjs().format("YYYY-MM-DD"),
      },
    });
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows 'Tomorrow' for an event dated tomorrow", () => {
    renderWith({
      selectedEvent: {
        _id: "e1",
        title: "Standup",
        date: dayjs().add(1, "day").format("YYYY-MM-DD"),
      },
    });
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("shows a full formatted date for events further out", () => {
    const future = dayjs().add(10, "day");
    renderWith({
      selectedEvent: {
        _id: "e1",
        title: "Standup",
        date: future.format("YYYY-MM-DD"),
      },
    });
    expect(
      screen.getByText(future.format("dddd, MMMM DD, YYYY")),
    ).toBeInTheDocument();
  });

  it("shows an 'All Day' chip and label when there is no start time", () => {
    renderWith({
      selectedEvent: {
        _id: "e1",
        title: "Standup",
        date: dayjs().format("YYYY-MM-DD"),
      },
    });
    expect(screen.getAllByText("All Day").length).toBeGreaterThan(0);
  });

  it("shows a start-end time range when both are present", () => {
    renderWith({
      selectedEvent: {
        _id: "e1",
        title: "Standup",
        date: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
        endTime: "09:30",
      },
    });
    expect(screen.getByText("09:00 - 09:30")).toBeInTheDocument();
  });

  it("shows only the start time when there is no end time", () => {
    renderWith({
      selectedEvent: {
        _id: "e1",
        title: "Standup",
        date: dayjs().format("YYYY-MM-DD"),
        startTime: "09:00",
      },
    });
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });

  it("shows the description when present, omits it otherwise", () => {
    const { rerender } = render(
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <EventPopover
          openPopover={true}
          popoverAnchorEl={document.body}
          handlePopoverClose={vi.fn()}
          selectedEvent={{
            _id: "e1",
            title: "Standup",
            date: dayjs().format("YYYY-MM-DD"),
            description: "Daily sync",
          }}
          onEditEvent={vi.fn()}
          onDeleteEvent={vi.fn()}
        />
      </ThemeContext.Provider>,
    );
    expect(screen.getByText("Daily sync")).toBeInTheDocument();
  });

  it("calls onEditEvent with the raw event when there is no .resource wrapper", () => {
    const event = {
      _id: "e1",
      title: "Standup",
      date: dayjs().format("YYYY-MM-DD"),
    };
    const { onEditEvent, handlePopoverClose } = renderWith({
      selectedEvent: event,
    });
    fireEvent.click(screen.getByLabelText("Edit event"));
    expect(onEditEvent).toHaveBeenCalledWith(event);
    expect(handlePopoverClose).toHaveBeenCalled();
  });

  it("calls onEditEvent with the unwrapped .resource when present", () => {
    const resource = {
      _id: "e1",
      title: "Standup",
      date: dayjs().format("YYYY-MM-DD"),
    };
    const { onEditEvent } = renderWith({ selectedEvent: { resource } });
    fireEvent.click(screen.getByLabelText("Edit event"));
    expect(onEditEvent).toHaveBeenCalledWith(resource);
  });

  it("closes the popover before calling onDeleteEvent with the selected event", () => {
    const event = {
      _id: "e1",
      title: "Standup",
      date: dayjs().format("YYYY-MM-DD"),
    };
    const { onDeleteEvent, handlePopoverClose } = renderWith({
      selectedEvent: event,
    });
    fireEvent.click(screen.getByLabelText("Delete event"));
    expect(onDeleteEvent).toHaveBeenCalledWith(event);
    expect(handlePopoverClose).toHaveBeenCalled();
  });

  it("closes the popover via the close button", () => {
    const { handlePopoverClose } = renderWith();
    fireEvent.click(screen.getByLabelText("Close event details"));
    expect(handlePopoverClose).toHaveBeenCalled();
  });
});
