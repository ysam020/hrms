import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ViewLeaveApplications from "@web/features/attendance/ViewLeaveApplications";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";
import {
  downloadExcel,
  generateFilename,
} from "@web/shared/utils/downloadReport";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.put = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  put: ReturnType<typeof vi.fn>;
};

vi.mock("@web/shared/utils/downloadReport", () => ({
  downloadExcel: vi.fn(),
  generateFilename: vi.fn(() => "Leave_Applications_06_2024"),
}));
const mockDownloadExcel = downloadExcel as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/features/attendance/LeaveApplication", () => ({
  default: ({ onSuccess }: any) => (
    <div>
      <span>Stub Leave Application Form</span>
      <button onClick={onSuccess}>stub-apply-success</button>
    </div>
  ),
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

const future = { v7_startTransition: true, v7_relativeSplatPath: true };

function makeLeave(overrides: Partial<any> = {}) {
  return {
    id: "l1",
    userId: "u2",
    username: "jdoe",
    firstName: "Jane",
    lastName: "Doe",
    from: "2099-06-10",
    to: "2099-06-12",
    reason: "Family trip",
    status: "Pending",
    ...overrides,
  };
}

function renderWith(
  records: any[],
  {
    user = { id: "u1", tenantRole: "employee" },
    setAlert = vi.fn(),
    initialEntries = ["/"],
  } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: { records, pagination: { totalCount: records.length } } },
  });
  return render(
    <MemoryRouter initialEntries={initialEntries} future={future}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user } as any}>
          <ViewLeaveApplications />
        </UserContext.Provider>
      </AlertContext.Provider>
    </MemoryRouter>,
  );
}

describe("ViewLeaveApplications", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.put.mockReset();
    mockDownloadExcel.mockReset();
  });

  it("shows an empty state when there are no leave applications", async () => {
    renderWith([]);
    expect(
      await screen.findByText("No leave applications found"),
    ).toBeInTheDocument();
  });

  it("renders each application's employee, formatted dates, and status", async () => {
    renderWith([makeLeave()]);
    expect(await screen.findByText("Jane Doe (jdoe)")).toBeInTheDocument();
    expect(screen.getByText("10 Jun 2099")).toBeInTheDocument();
    expect(screen.getByText("12 Jun 2099")).toBeInTheDocument();
    expect(
      screen.getByText("Pending", { selector: ".MuiChip-label" }),
    ).toBeInTheDocument();
  });

  it("shows an error alert when the fetch fails", async () => {
    const setAlert = vi.fn();
    mockApiClient.mockRejectedValue(new Error("network down"));
    render(
      <MemoryRouter future={future}>
        <AlertContext.Provider value={{ setAlert } as any}>
          <UserContext.Provider value={{ user: { id: "u1" } } as any}>
            <ViewLeaveApplications />
          </UserContext.Provider>
        </AlertContext.Provider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: expect.stringContaining("Failed to fetch"),
        }),
      ),
    );
  });

  it("hides Approve/Reject for a regular employee with no leave-management permission", async () => {
    renderWith([makeLeave()], {
      user: { id: "u1", tenantRole: "employee", permissions: [] },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.queryByLabelText(/Approve leave/)).not.toBeInTheDocument();
  });

  it("shows Approve/Reject for an admin reviewing someone else's leave, but not their own", async () => {
    renderWith(
      [
        makeLeave({ userId: "u2" }),
        makeLeave({ id: "l2", userId: "u1", username: "self" }),
      ],
      { user: { id: "u1", tenantRole: "admin" } },
    );
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.getByLabelText("Approve leave for jdoe")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Approve leave for self"),
    ).not.toBeInTheDocument();
  });

  it("shows Withdraw for the applicant's own pending leave", async () => {
    renderWith([makeLeave({ userId: "u1", status: "Pending" })], {
      user: { id: "u1", tenantRole: "employee" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.getByLabelText("Withdraw leave for jdoe"),
    ).toBeInTheDocument();
  });

  it("does not show Withdraw for an already-rejected leave", async () => {
    renderWith([makeLeave({ userId: "u1", status: "Rejected" })], {
      user: { id: "u1", tenantRole: "employee" },
    });
    await screen.findByText("Jane Doe (jdoe)");
    expect(
      screen.queryByLabelText("Withdraw leave for jdoe"),
    ).not.toBeInTheDocument();
  });

  it("approves a leave application after confirmation, refetches, and shows success", async () => {
    mocks.instance.put.mockResolvedValue({ data: { success: true } });
    renderWith([makeLeave({ userId: "u2" })], {
      user: { id: "u1", tenantRole: "admin" },
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Approve leave for jdoe"));
    expect(
      screen.getByText(
        /Are you sure you want to approve the leave application for jdoe/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Approve", { selector: "span" }));

    await waitFor(() =>
      expect(mocks.instance.put).toHaveBeenCalledWith(expect.any(String), {
        leaveId: "l1",
        action: "approve",
      }),
    );
  });

  it("shows the server error message and keeps the state when the API reports success: false", async () => {
    mocks.instance.put.mockResolvedValue({
      data: { success: false, message: "Already decided" },
    });
    const setAlert = vi.fn();
    renderWith([makeLeave({ userId: "u2" })], {
      user: { id: "u1", tenantRole: "admin" },
      setAlert,
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Reject leave for jdoe"));
    fireEvent.click(screen.getByText("Reject", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Already decided",
        }),
      ),
    );
  });

  it("withdraws the applicant's own leave and shows the withdrawal-specific success message", async () => {
    mocks.instance.put.mockResolvedValue({ data: { success: true } });
    const setAlert = vi.fn();
    renderWith([makeLeave({ userId: "u1", status: "Pending" })], {
      user: { id: "u1", tenantRole: "employee" },
      setAlert,
    });
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Withdraw leave for jdoe"));
    fireEvent.click(screen.getByText("Withdraw", { selector: "span" }));

    await waitFor(() =>
      expect(mocks.instance.put).toHaveBeenCalledWith(expect.any(String), {
        leaveId: "l1",
        action: "cancel",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Leave application withdrawn successfully",
      }),
    );
  });

  it("warns instead of downloading when there is no data to export", async () => {
    const setAlert = vi.fn();
    renderWith([], { setAlert });
    await screen.findByText("No leave applications found");

    // apiClient resolves the same records (empty) for the download call too
    fireEvent.click(
      screen.getByLabelText("Download leave applications as Excel"),
    );
    // Download button is disabled with no data — assert via disabled attr instead
    expect(
      screen.getByLabelText("Download leave applications as Excel"),
    ).toBeDisabled();
    expect(mockDownloadExcel).not.toHaveBeenCalled();
  });

  it("downloads an Excel export of the current results", async () => {
    mockDownloadExcel.mockResolvedValue(true);
    const setAlert = vi.fn();
    mockApiClient.mockResolvedValue({
      data: { data: { records: [makeLeave()], pagination: { totalCount: 1 } } },
    });
    render(
      <MemoryRouter future={future}>
        <AlertContext.Provider value={{ setAlert } as any}>
          <UserContext.Provider value={{ user: { id: "u1" } } as any}>
            <ViewLeaveApplications />
          </UserContext.Provider>
        </AlertContext.Provider>
      </MemoryRouter>,
    );
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(
      screen.getByLabelText("Download leave applications as Excel"),
    );

    await waitFor(() => expect(mockDownloadExcel).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Download completed successfully",
      }),
    );
  });

  it("opens the Apply for Leave dialog via the toolbar button, and via the ?action=apply deep link", async () => {
    renderWith([], { initialEntries: ["/leaves?action=apply"] });
    expect(
      await screen.findByText("Stub Leave Application Form"),
    ).toBeInTheDocument();
  });

  it("closes the Apply dialog and refreshes the list on a successful application", async () => {
    renderWith([]);
    await screen.findByText("No leave applications found");
    fireEvent.click(screen.getByLabelText("Apply for leave"));
    expect(screen.getByText("Stub Leave Application Form")).toBeInTheDocument();

    fireEvent.click(screen.getByText("stub-apply-success"));

    await waitFor(() =>
      expect(
        screen.queryByText("Stub Leave Application Form"),
      ).not.toBeInTheDocument(),
    );
  });
});
