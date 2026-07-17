import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Holidays from "@web/features/holidays/Holidays";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.get = vi.fn();
  instance.post = vi.fn();
  instance.put = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => {
    if (props.view === "year") {
      return (
        <input
          aria-label={props.placeholder}
          type="text"
          value={props.value ? String(props.value.getFullYear()) : ""}
          onChange={(e) =>
            props.onChange({
              value: e.target.value
                ? new Date(`${e.target.value}-01-01`)
                : null,
            })
          }
        />
      );
    }
    return (
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
        onBlur={props.onBlur}
      />
    );
  },
}));

vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));

function makeHoliday(overrides: Partial<any> = {}) {
  return {
    date: "2024-08-15",
    name: "Independence Day",
    createdBy: "admin",
    createdOn: "2024-01-01T10:00:00Z",
    ...overrides,
  };
}

function renderWith(
  holidays: any[],
  { user = { isSuperUser: true }, setAlert = vi.fn() } = {},
) {
  mockApiClient.mockResolvedValue({ data: { data: holidays } });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <Holidays />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

describe("Holidays", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.get.mockReset();
    mocks.instance.post.mockReset();
    mocks.instance.put.mockReset();
  });

  it("renders the list of holidays for the selected year", async () => {
    renderWith([makeHoliday()]);
    expect(await screen.findByText("Independence Day")).toBeInTheDocument();
    expect(screen.getByText("2024-08-15")).toBeInTheDocument();
  });

  it("shows an empty message when there are no holidays", async () => {
    renderWith([]);
    expect(
      await screen.findByText("No holidays configured"),
    ).toBeInTheDocument();
  });

  it("hides Add Holiday for a user without the add permission", async () => {
    renderWith([], { user: { tenantRole: "employee", permissions: [] } });
    await screen.findByText("No holidays configured");
    expect(screen.queryByLabelText("Add holiday")).not.toBeInTheDocument();
  });

  it("hides delete actions for a user without the delete permission", async () => {
    renderWith([makeHoliday()], {
      user: { tenantRole: "employee", permissions: [] },
    });
    await screen.findByText("Independence Day");
    expect(screen.queryByLabelText(/Delete holiday/)).not.toBeInTheDocument();
  });

  it("refetches holidays for the newly selected year", async () => {
    renderWith([makeHoliday()]);
    await screen.findByText("Independence Day");
    mocks.instance.mockClear();

    fireEvent.change(screen.getByLabelText("Select Year"), {
      target: { value: "2025" },
    });

    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("2025"),
      ),
    );
  });

  it("adds an inline row when Add Holiday is clicked, with Save/Cancel actions", async () => {
    renderWith([]);
    await screen.findByText("No holidays configured");

    fireEvent.click(screen.getByLabelText("Add holiday"));

    expect(
      screen.getByPlaceholderText("Enter holiday name"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Save holiday")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel adding holiday")).toBeInTheDocument();
  });

  it("cancels adding a holiday, removing the inline row", async () => {
    renderWith([]);
    await screen.findByText("No holidays configured");
    fireEvent.click(screen.getByLabelText("Add holiday"));

    fireEvent.click(screen.getByLabelText("Cancel adding holiday"));

    expect(
      screen.queryByPlaceholderText("Enter holiday name"),
    ).not.toBeInTheDocument();
  });

  it("shows validation errors when saving with empty name/date", async () => {
    renderWith([]);
    await screen.findByText("No holidays configured");
    fireEvent.click(screen.getByLabelText("Add holiday"));

    fireEvent.click(screen.getByLabelText("Save holiday"));

    // zod-formik-adapter shows a generic "Required" for an empty-string
    // min-length check rather than the custom message — same known quirk
    // documented elsewhere in this suite (e.g. AttendanceCorrection).
    expect(await screen.findByText("Required")).toBeInTheDocument();
  });

  it("submits a new holiday and refreshes the list", async () => {
    mocks.instance.post.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([], { setAlert });
    await screen.findByText("No holidays configured");
    fireEvent.click(screen.getByLabelText("Add holiday"));

    fireEvent.change(screen.getByPlaceholderText("Enter holiday name"), {
      target: { value: "New Year" },
    });
    fireEvent.change(screen.getByLabelText("Select date"), {
      target: { value: "2024-01-01" },
    });
    fireEvent.click(screen.getByLabelText("Save holiday"));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: "New Year", date: "2024-01-01" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Holiday added successfully",
      }),
    );
  });

  it("shows a network-specific message when adding fails due to network error", async () => {
    mocks.instance.post.mockRejectedValue({ message: "Network Error" });
    const setAlert = vi.fn();
    renderWith([], { setAlert });
    await screen.findByText("No holidays configured");
    fireEvent.click(screen.getByLabelText("Add holiday"));
    fireEvent.change(screen.getByPlaceholderText("Enter holiday name"), {
      target: { value: "New Year" },
    });
    fireEvent.change(screen.getByLabelText("Select date"), {
      target: { value: "2024-01-01" },
    });
    fireEvent.click(screen.getByLabelText("Save holiday"));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message:
            "Network Error, your details will be submitted when you are back online",
        }),
      ),
    );
  });

  it("opens the details popover for a holiday, showing created-by info", async () => {
    renderWith([makeHoliday({ createdBy: "Jane Doe" })]);
    await screen.findByText("Independence Day");

    fireEvent.click(screen.getByLabelText("View holiday details"));

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows 'N/A' in the details popover when createdBy is missing", async () => {
    renderWith([makeHoliday({ createdBy: null })]);
    await screen.findByText("Independence Day");
    fireEvent.click(screen.getByLabelText("View holiday details"));
    expect(await screen.findByText("N/A")).toBeInTheDocument();
  });

  it("deletes a holiday after confirmation", async () => {
    mocks.instance.put.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([makeHoliday()], { setAlert });
    await screen.findByText("Independence Day");

    fireEvent.click(screen.getByLabelText("Delete holiday Independence Day"));
    expect(
      screen.getByText('Are you sure you want to delete "Independence Day"?'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() =>
      expect(mocks.instance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ date: "2024-08-15" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Holiday deleted successfully",
      }),
    );
  });

  it("shows the server error message when delete fails", async () => {
    mocks.instance.put.mockRejectedValue({
      response: { data: { message: "Cannot delete past holiday" } },
    });
    const setAlert = vi.fn();
    renderWith([makeHoliday()], { setAlert });
    await screen.findByText("Independence Day");
    fireEvent.click(screen.getByLabelText("Delete holiday Independence Day"));
    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Cannot delete past holiday",
        }),
      ),
    );
  });
});
