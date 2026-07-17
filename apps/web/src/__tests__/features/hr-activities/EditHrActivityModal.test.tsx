import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EditHrActivityModal from "@web/features/hr-activities/EditHrActivityModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) =>
    props.timeOnly ? (
      <input
        aria-label={props.placeholder}
        type="text"
        value={
          props.value
            ? `${String(props.value.getHours()).padStart(2, "0")}:${String(
                props.value.getMinutes(),
              ).padStart(2, "0")}`
            : ""
        }
        onChange={(e) => {
          const [h, m] = e.target.value.split(":");
          const d = new Date();
          d.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
          props.onChange({ value: e.target.value ? d : null });
        }}
      />
    ) : (
      <input
        aria-label={props.placeholder}
        type="text"
        value={props.value ? props.value.toISOString().slice(0, 10) : ""}
        onChange={(e) =>
          props.onChange({
            value: e.target.value
              ? new Date(`${e.target.value}T00:00:00`)
              : null,
          })
        }
      />
    ),
}));
vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
    />
  ),
}));

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function renderModal(overrides: Partial<any> = {}, setAlert = vi.fn()) {
  const handleClose = vi.fn();
  const getData = vi.fn();
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <EditHrActivityModal
        open={true}
        handleClose={handleClose}
        getData={getData}
        activityData={{
          id: "a1",
          title: "Onboarding Session",
          description: "Welcome new hires",
          date: futureDate(30),
          time: "10:30",
        }}
        {...overrides}
      />
    </AlertContext.Provider>,
  );
  return { handleClose, getData, setAlert };
}

describe("EditHrActivityModal", () => {
  beforeEach(() => mockPut.mockReset());

  it("prefills the form fields from activityData", () => {
    renderModal();
    expect(screen.getByDisplayValue("Onboarding Session")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Welcome new hires")).toBeInTheDocument();
    expect(screen.getByLabelText("Time")).toHaveValue("10:30");
  });

  it("re-prefills when activityData changes (e.g. editing a different row)", () => {
    const { rerender } = render(
      <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
        <EditHrActivityModal
          open={true}
          handleClose={vi.fn()}
          getData={vi.fn()}
          activityData={{
            id: "a1",
            title: "First",
            description: "d1",
            date: futureDate(10),
            time: "09:00",
          }}
        />
      </AlertContext.Provider>,
    );
    expect(screen.getByDisplayValue("First")).toBeInTheDocument();

    rerender(
      <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
        <EditHrActivityModal
          open={true}
          handleClose={vi.fn()}
          getData={vi.fn()}
          activityData={{
            id: "a2",
            title: "Second",
            description: "d2",
            date: futureDate(10),
            time: "09:00",
          }}
        />
      </AlertContext.Provider>,
    );
    expect(screen.getByDisplayValue("Second")).toBeInTheDocument();
  });

  it("submits the update, calling getData and handleClose on success", async () => {
    mockPut.mockResolvedValue({ data: { message: "Activity updated" } });
    const { handleClose, getData, setAlert } = renderModal();

    fireEvent.change(screen.getByDisplayValue("Onboarding Session"), {
      target: { value: "Updated Title" },
    });
    fireEvent.click(screen.getByText("Update Activity"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ title: "Updated Title" }),
      ),
    );
    expect(getData).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Activity updated",
      }),
    );
  });

  it("shows a validation error for a title that is too short", async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue("Onboarding Session"), {
      target: { value: "AB" },
    });
    fireEvent.click(screen.getByText("Update Activity"));

    expect(
      await screen.findByText("Title must be at least 3 characters"),
    ).toBeInTheDocument();
  });
});
