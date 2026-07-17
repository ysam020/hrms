import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ViewHrActivities from "@web/features/hr-activities/ViewHrActivities";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.get = vi.fn();
  instance.post = vi.fn();
  instance.put = vi.fn();
  instance.delete = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.value ?? ""}
      onChange={(e) => props.onChange({ value: e.target.value })}
    >
      {(props.options || []).map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

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
        onBlur={props.onBlur}
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
        onBlur={props.onBlur}
      />
    ),
}));

vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      id={props.id}
      placeholder={props.placeholder}
      value={props.value}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function makeActivity(overrides: Partial<any> = {}) {
  return {
    id: "a1",
    title: "Onboarding Session",
    description: "Welcome new hires",
    date: futureDate(30),
    time: "10:30",
    status: "Active",
    createdBy: "admin",
    createdOn: "2024-06-01T10:00:00Z",
    lastUpdatedBy: null,
    lastUpdatedOn: null,
    ...overrides,
  };
}

function renderWith(
  activities: any[],
  {
    user = { isSuperUser: true },
    setAlert = vi.fn(),
    totalCount = activities.length,
  } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: { activities, pagination: { totalCount } } },
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <ViewHrActivities />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

describe("ViewHrActivities", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.get.mockReset();
    mocks.instance.post.mockReset();
    mocks.instance.put.mockReset();
    mocks.instance.delete.mockReset();
  });

  it("renders activities with formatted date/time and status chip", async () => {
    const activity = makeActivity();
    renderWith([activity]);
    expect(await screen.findByText("Onboarding Session")).toBeInTheDocument();
    const [y, m, d] = activity.date.split("-");
    expect(screen.getByText(`${d}-${m}-${y}`)).toBeInTheDocument();
    expect(screen.getByText("10:30 AM")).toBeInTheDocument();
    // "Active" also appears as a status-filter <option>, so at least the
    // status chip plus that option should both render it.
    expect(screen.getAllByText("Active").length).toBeGreaterThanOrEqual(2);
  });

  it("shows an empty message when there are no activities", async () => {
    renderWith([]);
    expect(
      await screen.findByText("No HR activities found"),
    ).toBeInTheDocument();
  });

  it("hides row actions except details for a user without edit/delete permission", async () => {
    renderWith([makeActivity()], {
      user: { tenantRole: "employee", permissions: [] },
    });
    await screen.findByText("Onboarding Session");
    expect(screen.queryByLabelText(/Edit HR activity/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Delete HR activity/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("View HR activity details"),
    ).toBeInTheDocument();
  });

  it("hides all row actions for a deleted activity", async () => {
    renderWith([makeActivity({ status: "Deleted" })]);
    await screen.findByText("Onboarding Session");
    expect(screen.queryByLabelText(/Edit HR activity/)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("View HR activity details"),
    ).not.toBeInTheDocument();
  });

  it("hides Add New Activity for a user without create permission", async () => {
    renderWith([], { user: { tenantRole: "employee", permissions: [] } });
    await screen.findByText("No HR activities found");
    expect(
      screen.queryByLabelText("Add new HR activity"),
    ).not.toBeInTheDocument();
  });

  it("refetches when the status filter changes", async () => {
    renderWith([makeActivity()]);
    await screen.findByText("Onboarding Session");
    mocks.instance.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "Expired" },
    });

    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("Expired"),
      ),
    );
  });

  it("debounces the search filter before refetching", async () => {
    vi.useFakeTimers();
    renderWith([makeActivity()]);
    await vi.waitFor(() => expect(mocks.instance).toHaveBeenCalled());
    mocks.instance.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Search activities…"), {
      target: { value: "onboarding" },
    });
    expect(mocks.instance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("search=onboarding"),
      ),
    );
  });

  it("opens the details popover with created/updated info", async () => {
    renderWith([
      makeActivity({
        createdBy: "Jane Doe",
        lastUpdatedBy: "John Smith",
        lastUpdatedOn: "2024-06-10T12:00:00Z",
      }),
    ]);
    await screen.findByText("Onboarding Session");

    fireEvent.click(screen.getByLabelText("View HR activity details"));

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("opens the edit modal prefilled, and submits an update", async () => {
    mocks.instance.put.mockResolvedValue({
      data: { message: "Activity updated" },
    });
    const setAlert = vi.fn();
    renderWith([makeActivity()], { setAlert });
    await screen.findByText("Onboarding Session");

    fireEvent.click(
      screen.getByLabelText("Edit HR activity: Onboarding Session"),
    );

    expect(
      await screen.findByDisplayValue("Onboarding Session"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Update Activity"));

    await waitFor(() =>
      expect(mocks.instance.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ title: "Onboarding Session" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Activity updated",
      }),
    );
  });

  it("deletes an activity after confirmation", async () => {
    mocks.instance.delete.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([makeActivity()], { setAlert });
    await screen.findByText("Onboarding Session");

    fireEvent.click(
      screen.getByLabelText("Delete HR activity: Onboarding Session"),
    );
    expect(
      screen.getByText('Are you sure you want to delete "Onboarding Session"?'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() => expect(mocks.instance.delete).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "HR activity deleted successfully",
      }),
    );
  });

  it("opens the Add New Activity dialog and creates an activity", async () => {
    mocks.instance.post.mockResolvedValue({
      data: { message: "Activity created" },
    });
    const setAlert = vi.fn();
    renderWith([], { setAlert });
    await screen.findByText("No HR activities found");

    fireEvent.click(screen.getByLabelText("Add new HR activity"));
    expect(screen.getByText("Add New Activity")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Activity Title"), {
      target: { value: "Team Offsite" },
    });
    fireEvent.change(screen.getByPlaceholderText("Description"), {
      target: { value: "Annual team offsite event" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2030-01-01" },
    });
    fireEvent.change(screen.getByLabelText("Time"), {
      target: { value: "09:00" },
    });

    fireEvent.click(screen.getByText("Create Activity"));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: "Team Offsite",
          description: "Annual team offsite event",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Activity created",
      }),
    );
  });
});
