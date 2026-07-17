import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ViewIndividualKyc from "@web/features/employee-kyc/ViewIndividualKyc";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useSocketEvent", () => ({ default: vi.fn() }));

vi.mock("@web/features/profile/BasicInfo", () => ({
  default: (props: any) => <div>Stub BasicInfo: {props.user?.username}</div>,
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeKycUser(overrides: Partial<any> = {}) {
  return {
    username: "jdoe",
    employeeStatus: "Active",
    kyc_approval: "Pending",
    ...overrides,
  };
}

function renderWith(
  {
    refetch = vi.fn(),
    loading = false,
    data,
  }: { refetch?: any; loading?: boolean; data: any },
  {
    user = { username: "hr1", isSuperUser: true },
    setAlert = vi.fn(),
    refetchPendingApprovals = vi.fn(),
  } = {},
) {
  mockUseFetchData.mockReturnValue({ data, loading, refetch });
  const routeUsername = data?.username ?? "jdoe";
  return render(
    <MemoryRouter initialEntries={[`/kyc/${routeUsername}`]}>
      <Routes>
        <Route
          path="/kyc/:username"
          element={
            <AlertContext.Provider value={{ setAlert } as any}>
              <UserContext.Provider value={{ user } as any}>
                <ApprovalsBadgeContext.Provider
                  value={{ refetchPendingApprovals } as any}
                >
                  <ViewIndividualKyc />
                </ApprovalsBadgeContext.Provider>
              </UserContext.Provider>
            </AlertContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ViewIndividualKyc", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockNavigate.mockClear();
  });

  it("renders nothing (besides dialogs) while loading", () => {
    renderWith({ loading: true, data: null });
    expect(screen.queryByText(/Stub BasicInfo/)).not.toBeInTheDocument();
  });

  it("shows the employee's basic info once loaded", async () => {
    renderWith({ data: makeKycUser() });
    expect(await screen.findByText("Stub BasicInfo: jdoe")).toBeInTheDocument();
  });

  it("shows Approve and Request Revision for a privileged reviewer on someone else's record", async () => {
    renderWith(
      { data: makeKycUser() },
      { user: { username: "hr1", isSuperUser: true } },
    );
    await screen.findByText("Stub BasicInfo: jdoe");
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("Request Revision")).toBeInTheDocument();
  });

  it("hides Approve/Request Revision when viewing your own record", async () => {
    renderWith(
      { data: makeKycUser({ username: "hr1" }) },
      { user: { username: "hr1", isSuperUser: true } },
    );
    await screen.findByText("Stub BasicInfo: hr1");
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Request Revision")).not.toBeInTheDocument();
  });

  it("hides Approve/Request Revision for a user without those permissions", async () => {
    renderWith(
      { data: makeKycUser() },
      { user: { username: "someone-else", permissions: [] } },
    );
    await screen.findByText("Stub BasicInfo: jdoe");
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Request Revision")).not.toBeInTheDocument();
  });

  it("hides Approve/Request Revision once the record is already Approved (uneditable)", async () => {
    renderWith({ data: makeKycUser({ kyc_approval: "Approved" }) });
    await screen.findByText("Stub BasicInfo: jdoe");
    expect(screen.queryByText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByText("Request Revision")).not.toBeInTheDocument();
  });

  it("shows 'Request KYC Update' for the employee's own Approved record", async () => {
    renderWith(
      { data: makeKycUser({ username: "hr1", kyc_approval: "Approved" }) },
      { user: { username: "hr1", isSuperUser: true } },
    );
    await screen.findByText("Stub BasicInfo: hr1");
    expect(screen.getByText("Request KYC Update")).toBeInTheDocument();
  });

  it("shows the revision-requested banner with per-field notes", async () => {
    renderWith({
      data: makeKycUser({
        kyc_approval: "Revision Requested",
        kyc_revision_notes: { mobile: "Invalid number" },
      }),
    });
    expect(
      await screen.findByText("Revision requested — awaiting resubmission"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Mobile: Invalid number/)).toBeInTheDocument();
  });

  it("shows 'Waiting for approver...' on the employee's own Edit Requested record", async () => {
    renderWith(
      {
        data: makeKycUser({ username: "hr1", kyc_approval: "Edit Requested" }),
      },
      { user: { username: "hr1", isSuperUser: true } },
    );
    expect(
      await screen.findByText("Waiting for approver..."),
    ).toBeInTheDocument();
  });

  it("shows the requester's name and an Allow Editing action to a privileged reviewer", async () => {
    mockPut.mockResolvedValue({ data: { message: "Edit allowed" } });
    const refetch = vi.fn();
    const refetchPendingApprovals = vi.fn();
    renderWith(
      { data: makeKycUser({ kyc_approval: "Edit Requested" }), refetch },
      { refetchPendingApprovals },
    );
    expect(
      await screen.findByText("jdoe requested to edit their approved KYC"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Allow Editing"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        username: "jdoe",
      }),
    );
    expect(refetch).toHaveBeenCalled();
    expect(refetchPendingApprovals).toHaveBeenCalled();
  });

  it("opens the Approve confirmation and submits an approval", async () => {
    mockPost.mockResolvedValue({ data: { message: "KYC approved" } });
    const refetch = vi.fn();
    const setAlert = vi.fn();
    renderWith({ data: makeKycUser(), refetch }, { setAlert });
    await screen.findByText("Approve");

    fireEvent.click(screen.getByText("Approve"));
    expect(
      screen.getByText("Are you sure you want to approve jdoe's KYC?"),
    ).toBeInTheDocument();
    const approveButtons = screen.getAllByText("Approve", { selector: "span" });
    fireEvent.click(approveButtons[approveButtons.length - 1]);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ username: "jdoe", kyc_approval: "Approved" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "KYC approved" }),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("opens the revision dialog, requires a note per checked field, and submits", async () => {
    mockPost.mockResolvedValue({ data: { message: "Revision requested" } });
    const setAlert = vi.fn();
    renderWith({ data: makeKycUser() }, { setAlert });
    await screen.findByText("Request Revision");
    fireEvent.click(screen.getByText("Request Revision"));

    expect(
      screen.getByRole("button", { name: "Send revision request" }),
    ).toBeDisabled();

    fireEvent.click(screen.getByLabelText("Mobile"));
    expect(
      screen.getByRole("button", { name: "Send revision request" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("What's wrong with Mobile?"), {
      target: { value: "Number looks invalid" },
    });
    expect(
      screen.getByRole("button", { name: "Send revision request" }),
    ).not.toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", { name: "Send revision request" }),
    );

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          username: "jdoe",
          kyc_approval: "Revision Requested",
          field_issues: { mobile: "Number looks invalid" },
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Revision requested",
      }),
    );
  });

  it("opens the request-edit-access dialog and requires a reason before sending", async () => {
    mockPost.mockResolvedValue({ data: { message: "Request sent" } });
    const setAlert = vi.fn();
    renderWith(
      { data: makeKycUser({ username: "hr1", kyc_approval: "Approved" }) },
      { user: { username: "hr1", isSuperUser: true }, setAlert },
    );
    await screen.findByText("Request KYC Update");
    fireEvent.click(screen.getByText("Request KYC Update"));

    expect(screen.getByRole("button", { name: "Send request" })).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText("What needs to be updated, and why?"),
      {
        target: { value: "Bank account changed" },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        reason: "Bank account changed",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Request sent" }),
    );
  });

  it("shows Edit only when canEditKyc is granted and the record isn't blocked", async () => {
    renderWith(
      { data: makeKycUser({ kyc_approval: "Pending" }) },
      { user: { username: "hr1", isSuperUser: true } },
    );
    await screen.findByText("Stub BasicInfo: jdoe");
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("hides Edit once the edit window has closed on a Pending record", async () => {
    renderWith(
      {
        data: makeKycUser({
          kyc_approval: "Pending",
          kyc_edit_window: "closed",
        }),
      },
      { user: { username: "hr1", isSuperUser: true } },
    );
    await screen.findByText("Stub BasicInfo: jdoe");
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("navigates to the edit page when Edit is clicked", async () => {
    renderWith(
      { data: makeKycUser() },
      { user: { username: "hr1", isSuperUser: true } },
    );
    await screen.findByText("Edit");
    fireEvent.click(screen.getByText("Edit"));
    expect(mockNavigate).toHaveBeenCalledWith("/edit-kyc/jdoe");
  });
});
