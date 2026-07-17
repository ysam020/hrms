import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import dayjs from "dayjs";
import AddEventModal from "@web/features/layout/modals/AddEventModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      id={props.id}
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));
vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) =>
    props.timeOnly ? (
      <input
        aria-label={props.placeholder}
        value={
          props.value
            ? `${String(props.value.getHours()).padStart(2, "0")}:${String(props.value.getMinutes()).padStart(2, "0")}`
            : ""
        }
        onChange={(e) => {
          const [h, m] = e.target.value.split(":");
          const d = new Date(0);
          d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
          props.onChange({ value: e.target.value ? d : null });
        }}
        onBlur={props.onBlur}
      />
    ) : (
      <input
        aria-label={props.placeholder}
        value={props.value ? props.value.toISOString().slice(0, 10) : ""}
        onChange={(e) =>
          props.onChange({
            value: e.target.value
              ? new Date(`${e.target.value}T00:00:00`)
              : null,
          })
        }
        onBlur={props.onBlur}
      />
    ),
}));

function futureDate(days: number) {
  return dayjs().add(days, "day").format("YYYY-MM-DD");
}

function renderModal(overrides: Partial<any> = {}, setAlert = vi.fn()) {
  const handleClose = vi.fn();
  const getEvents = vi.fn();
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <AddEventModal
        open={true}
        handleClose={handleClose}
        getEvents={getEvents}
        selectedSlot={null}
        {...overrides}
      />
    </AlertContext.Provider>,
  );
  return { handleClose, getEvents, setAlert };
}

describe("AddEventModal", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
  });

  it("shows 'Add New Event' by default", () => {
    renderModal();
    expect(screen.getByText("Add New Event")).toBeInTheDocument();
  });

  it("shows 'Edit Event' and prefills fields in edit mode", () => {
    renderModal({
      isEditMode: true,
      editEventData: {
        _id: "e1",
        title: "Team Sync",
        date: futureDate(2),
        startTime: "10:00",
        endTime: "11:00",
        description: "Weekly sync",
      },
    });
    expect(screen.getByText("Edit Event")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Event Title")).toHaveValue("Team Sync");
    expect(screen.getByPlaceholderText("Event Description")).toHaveValue(
      "Weekly sync",
    );
  });

  it("prefills date and times from a selected calendar slot, ignoring a midnight start", () => {
    const start = new Date(`${futureDate(3)}T00:00:00`);
    const end = new Date(`${futureDate(3)}T00:00:00`);
    renderModal({ selectedSlot: { start, end } });
    expect(screen.getByLabelText("Start Time")).toHaveValue("");
  });

  it("prefills a real start/end time range from a selected slot", () => {
    const day = futureDate(3);
    const start = new Date(`${day}T09:00:00`);
    const end = new Date(`${day}T10:00:00`);
    renderModal({ selectedSlot: { start, end } });
    expect(screen.getByLabelText("Start Time")).toHaveValue("09:00");
    expect(screen.getByLabelText("End Time")).toHaveValue("10:00");
  });

  it("disables Create Event until title and date are present", () => {
    renderModal();
    expect(
      screen.getByText("Create Event", { selector: "span" }).closest("button"),
    ).toBeDisabled();
  });

  it("blocks submission when the end time doesn't come after the start time", async () => {
    // Blocked by the zod schema's own object-level refine (equal start/end
    // fails "End time must be later than start time" before the component's
    // own onSubmit isSameOrBefore check ever runs) — either way, the save
    // must not go through.
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("Event Title"), {
      target: { value: "Standup" },
    });
    fireEvent.change(screen.getByLabelText("Event Date"), {
      target: { value: futureDate(1) },
    });
    fireEvent.change(screen.getByLabelText("Start Time"), {
      target: { value: "10:00" },
    });
    fireEvent.change(screen.getByLabelText("End Time"), {
      target: { value: "10:00" },
    });

    fireEvent.click(screen.getByText("Create Event", { selector: "span" }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("creates a new event via POST", async () => {
    mockPost.mockResolvedValue({});
    const { handleClose, getEvents, setAlert } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("Event Title"), {
      target: { value: "Standup" },
    });
    fireEvent.change(screen.getByLabelText("Event Date"), {
      target: { value: futureDate(1) },
    });
    fireEvent.change(screen.getByLabelText("Start Time"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("End Time"), {
      target: { value: "09:30" },
    });

    fireEvent.click(screen.getByText("Create Event", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: "Standup",
          startTime: "09:00",
          endTime: "09:30",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Event created successfully!",
      }),
    );
    expect(getEvents).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  it("updates an existing event via PUT, addressed by its id", async () => {
    mockPut.mockResolvedValue({});
    const { setAlert } = renderModal({
      isEditMode: true,
      editEventData: {
        _id: "e1",
        title: "Team Sync",
        date: futureDate(2),
        startTime: "10:00",
        endTime: "11:00",
        description: "",
      },
    });

    fireEvent.click(screen.getByText("Update Event", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ title: "Team Sync" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Event updated successfully!",
      }),
    );
  });

  it("shows the server error message when saving fails", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Slot no longer available" } },
    });
    const { setAlert } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("Event Title"), {
      target: { value: "Standup" },
    });
    fireEvent.change(screen.getByLabelText("Event Date"), {
      target: { value: futureDate(1) },
    });
    fireEvent.change(screen.getByLabelText("Start Time"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("End Time"), {
      target: { value: "09:30" },
    });

    fireEvent.click(screen.getByText("Create Event", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Slot no longer available",
        }),
      ),
    );
  });
});
