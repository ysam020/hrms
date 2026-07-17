import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ViewResignations from "@web/features/resignation/ViewResignations";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.put = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  put: ReturnType<typeof vi.fn>;
};

vi.mock("@web/features/resignation/ResignationForm", () => ({
  default: ({ onSuccess }: any) => (
    <div>
      <span>Stub Resignation Form</span>
      <button onClick={onSuccess}>stub-resign-success</button>
    </div>
  ),
}));

vi.mock("@web/features/resignation/ResignationDecisionDialog", () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        Stub decision dialog: {props.mode} for {props.employeeName}
        <button onClick={props.onDone}>stub-decision-done</button>
      </div>
    ) : null,
}));

vi.mock("@web/features/resignation/ExitManagementDialog", () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        Stub exit management for {props.employeeName}, canManage=
        {String(props.canManage)}
        <button onClick={props.onClose}>stub-exit-close</button>
      </div>
    ) : null,
}));

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

function makeResignation(overrides: Partial<any> = {}) {
  return {
    id: "r1",
    userId: "u2",
    username: "jdoe",
    firstName: "Jane",
    lastName: "Doe",
    resignationDate: "2024-06-01",
    lastWorkingDate: "2024-07-01",
    status: "Submitted",
    ...overrides,
  };
}

function renderWith(
  records: any[],
  { user = { id: "u1", tenantRole: "employee" }, setAlert = vi.fn() } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: records, totalCount: records.length },
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <ViewResignations />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

describe("ViewResignations", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.put.mockReset();
  });

  it("shows an empty state when there are no resignations", async () => {
    renderWith([]);
    expect(
      await screen.findByText("No resignations found"),
    ).toBeInTheDocument();
  });

  it("renders the employee label, formatted dates, and status chip", async () => {
    renderWith([makeResignation()]);
    expect(await screen.findByText("Jane Doe (jdoe)")).toBeInTheDocument();
    expect(screen.getByText("01-06-2024")).toBeInTheDocument();
    expect(screen.getByText("01-07-2024")).toBeInTheDocument();
    expect(
      screen.getByText("Submitted", { selector: "span.MuiChip-label" }),
    ).toBeInTheDocument();
  });

  it("shows an error alert when the fetch fails", async () => {
    const setAlert = vi.fn();
    mockApiClient.mockRejectedValue(new Error("network down"));
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: { id: "u1" } } as any}>
          <ViewResignations />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Failed to fetch resignations",
        }),
      ),
    );
  });

  it("shows View (not Manage) exit details for a user without exit-management permission", async () => {
    renderWith([makeResignation()], {
      user: { id: "u1", tenantRole: "employee", permissions: [] },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.getByLabelText("View exit details for jdoe"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Manage exit for jdoe"),
    ).not.toBeInTheDocument();
  });

  it("shows Manage exit details for an admin", async () => {
    renderWith([makeResignation()], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.getByLabelText("Manage exit for jdoe")).toBeInTheDocument();
  });

  it("hides Approve/Reject for an admin's own resignation", async () => {
    renderWith([makeResignation({ userId: "u1" })], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.queryByLabelText(/Approve resignation/),
    ).not.toBeInTheDocument();
  });

  it("shows Approve/Reject for an admin reviewing someone else's submitted resignation", async () => {
    renderWith([makeResignation({ userId: "u2", status: "Submitted" })], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.getByLabelText("Approve resignation for jdoe"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Reject resignation for jdoe"),
    ).toBeInTheDocument();
  });

  it("hides Approve/Reject once already decided", async () => {
    renderWith([makeResignation({ userId: "u2", status: "Approved" })], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.queryByLabelText(/Approve resignation/),
    ).not.toBeInTheDocument();
  });

  it("shows Withdraw only for the applicant's own submitted resignation", async () => {
    renderWith([makeResignation({ userId: "u1", status: "Submitted" })], {
      user: { id: "u1", tenantRole: "employee" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.getByLabelText("Withdraw resignation for jdoe"),
    ).toBeInTheDocument();
  });

  it("does not show Withdraw once already approved", async () => {
    renderWith([makeResignation({ userId: "u1", status: "Approved" })], {
      user: { id: "u1", tenantRole: "employee" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.queryByLabelText("Withdraw resignation for jdoe"),
    ).not.toBeInTheDocument();
  });

  it("opens the (stubbed) decision dialog with the correct mode on Approve", async () => {
    renderWith([makeResignation({ userId: "u2" })], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Approve resignation for jdoe"));

    expect(
      screen.getByText("Stub decision dialog: approve for jdoe"),
    ).toBeInTheDocument();
  });

  it("refreshes the list once the decision dialog reports done", async () => {
    renderWith([makeResignation({ userId: "u2" })], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    fireEvent.click(screen.getByLabelText("Approve resignation for jdoe"));
    const callsBefore = mockApiClient.mock.calls.length;

    fireEvent.click(screen.getByText("stub-decision-done"));

    await waitFor(() =>
      expect(mockApiClient.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it("opens the (stubbed) exit management dialog with canManage wired correctly", async () => {
    renderWith([makeResignation()], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Manage exit for jdoe"));

    expect(
      screen.getByText("Stub exit management for jdoe, canManage=true"),
    ).toBeInTheDocument();
  });

  it("withdraws a resignation after confirmation and shows the success message", async () => {
    mocks.instance.put.mockResolvedValue({ data: {} });
    const setAlert = vi.fn();
    renderWith([makeResignation({ userId: "u1", status: "Submitted" })], {
      user: { id: "u1", tenantRole: "employee" },
      setAlert,
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Withdraw resignation for jdoe"));
    expect(
      screen.getByText(
        "Are you sure you want to withdraw the resignation for jdoe?",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Withdraw", { selector: "span" }));

    await waitFor(() =>
      expect(mocks.instance.put).toHaveBeenCalledWith(
        "/withdraw-resignation/r1",
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Resignation withdrawn successfully",
      }),
    );
  });

  it("opens the (stubbed) decision dialog with the correct mode on Reject", async () => {
    renderWith([makeResignation({ userId: "u2" })], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Reject resignation for jdoe"));

    expect(
      screen.getByText("Stub decision dialog: reject for jdoe"),
    ).toBeInTheDocument();
  });

  it("refetches with the status filter applied when the status dropdown changes", async () => {
    renderWith([makeResignation()], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    mockApiClient.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "Approved" },
    });

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("status=Approved"),
      ),
    );
  });

  it("debounces the search box before triggering a refetch", async () => {
    vi.useFakeTimers();
    renderWith([makeResignation()], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await vi.waitFor(() =>
      expect(screen.queryByText("Jane Doe (jdoe)")).toBeInTheDocument(),
    );
    mockApiClient.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Search resignations…"), {
      target: { value: "jane" },
    });
    expect(mockApiClient).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    await vi.waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("search=jane"),
      ),
    );
    vi.useRealTimers();
  });

  it("closes the withdraw confirmation without calling the API when cancelled", async () => {
    renderWith([makeResignation({ userId: "u1", status: "Submitted" })], {
      user: { id: "u1", tenantRole: "employee" },
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Withdraw resignation for jdoe"));
    fireEvent.click(screen.getByText("Cancel", { selector: "span" }));

    await waitFor(() =>
      expect(
        screen.queryByText(
          "Are you sure you want to withdraw the resignation for jdoe?",
        ),
      ).not.toBeInTheDocument(),
    );
    expect(mocks.instance.put).not.toHaveBeenCalled();
  });

  it("shows a generic error message when withdrawal fails", async () => {
    mocks.instance.put.mockRejectedValue({
      response: { data: { message: "Withdrawal window closed" } },
    });
    const setAlert = vi.fn();
    renderWith([makeResignation({ userId: "u1", status: "Submitted" })], {
      user: { id: "u1", tenantRole: "employee" },
      setAlert,
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Withdraw resignation for jdoe"));
    fireEvent.click(screen.getByText("Withdraw", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Withdrawal window closed",
        }),
      ),
    );
    // Dialog stays open (withdrawTarget only clears on success) so the user
    // can retry or cancel.
    expect(
      screen.getByText(
        "Are you sure you want to withdraw the resignation for jdoe?",
      ),
    ).toBeInTheDocument();
  });

  it("closes the exit management dialog via its onClose callback", async () => {
    renderWith([makeResignation()], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Manage exit for jdoe"));
    expect(
      screen.getByText(/Stub exit management for jdoe/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("stub-exit-close"));
    expect(
      screen.queryByText(/Stub exit management for jdoe/),
    ).not.toBeInTheDocument();
  });

  it("opens the submit-resignation dialog and closes it with a refresh on success", async () => {
    renderWith([]);
    await screen.findByText("No resignations found");

    fireEvent.click(screen.getByLabelText("Submit resignation"));
    expect(screen.getByText("Stub Resignation Form")).toBeInTheDocument();

    fireEvent.click(screen.getByText("stub-resign-success"));

    await waitFor(() =>
      expect(
        screen.queryByText("Stub Resignation Form"),
      ).not.toBeInTheDocument(),
    );
  });
});
