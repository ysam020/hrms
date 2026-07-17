import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AttendanceCorrection from "@web/features/attendance/AttendanceCorrection";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => {
    const hh = props.value
      ? String(props.value.getHours()).padStart(2, "0")
      : "";
    const mm = props.value
      ? String(props.value.getMinutes()).padStart(2, "0")
      : "";
    return (
      <input
        type="text"
        aria-label={props.placeholder}
        value={hh && mm ? `${hh}:${mm}` : ""}
        onChange={(e) => {
          const [h, m] = e.target.value.split(":").map(Number);
          props.onChange({ value: new Date(1970, 0, 1, h || 0, m || 0) });
        }}
      />
    );
  },
}));

function renderWith(setAlert = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <AttendanceCorrection />
    </AlertContext.Provider>,
  );
  return { setAlert };
}

describe("AttendanceCorrection", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockGet.mockResolvedValue({ data: { data: [] } });
  });

  it("debounce-searches employees as the user types and lists matching results", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: "u1", username: "jdoe" },
          { id: "u2", username: "bsmith" },
        ],
      },
    });
    renderWith();

    fireEvent.change(screen.getByPlaceholderText("Search employee..."), {
      target: { value: "jd" },
    });
    expect(mockGet).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);

    expect(mockGet).toHaveBeenCalledWith(
      expect.stringContaining("/get-all-users?search=jd&limit=20"),
    );
    vi.useRealTimers();
  });

  it("selects an employee from the results and clears the required-field error", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({
      data: { data: [{ id: "u1", username: "jdoe" }] },
    });
    renderWith();

    const input = screen.getByPlaceholderText("Search employee...");
    fireEvent.change(input, { target: { value: "jd" } });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    const option = await screen.findByText("jdoe");
    fireEvent.click(option);

    expect(
      (screen.getByPlaceholderText("Search employee...") as HTMLInputElement)
        .value,
    ).toBe("jdoe");
  });

  it("shows a required-field error when submitting without selecting an employee", async () => {
    renderWith();
    fireEvent.click(screen.getByText("Update Attendance"));
    expect(await screen.findByText("Required")).toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("submits the correction with the selected employee and entered times", async () => {
    vi.useFakeTimers();
    mockGet.mockResolvedValue({
      data: { data: [{ id: "u1", username: "jdoe" }] },
    });
    mockPut.mockResolvedValue({ data: { message: "Attendance corrected" } });
    const setAlert = vi.fn();
    renderWith(setAlert);

    fireEvent.change(screen.getByPlaceholderText("Search employee..."), {
      target: { value: "jd" },
    });
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();
    fireEvent.click(await screen.findByText("jdoe"));

    fireEvent.change(screen.getByLabelText("Time In"), {
      target: { value: "09:00" },
    });
    fireEvent.change(screen.getByLabelText("Time Out"), {
      target: { value: "18:00" },
    });

    fireEvent.click(screen.getByText("Update Attendance"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        userId: "u1",
        timeIn: "09:00",
        timeOut: "18:00",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Attendance corrected",
      }),
    );
  });
});
