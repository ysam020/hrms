import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OrgSettings from "@web/features/settings/OrgSettings";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/features/settings/exit-policy/ExitPolicySettings", () => ({
  default: () => <div>Stub ExitPolicySettings</div>,
}));
vi.mock(
  "@web/features/settings/payroll-components/PayrollComponentsSettings",
  () => ({
    default: () => <div>Stub PayrollComponentsSettings</div>,
  }),
);
vi.mock(
  "@web/features/settings/recruitment-pipeline/RecruitmentPipelineSettings",
  () => ({
    default: () => <div>Stub RecruitmentPipelineSettings</div>,
  }),
);

function setupApi({
  active = {},
  pending = [],
}: { active?: any; pending?: any[] } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/tenant-settings")
      return Promise.resolve({ data: { data: { active, pending } } });
    if (url.includes("get-profile") || url.includes("profile"))
      return Promise.resolve({
        data: { success: true, data: { user: { id: "u1" } } },
      });
    return Promise.resolve({ data: {} });
  });
}

function renderOrgSettings(
  user: any,
  setAlert = vi.fn(),
  setUser = vi.fn(),
  path = "/settings",
) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <UserContext.Provider value={{ user, setUser } as any}>
        <AlertContext.Provider value={{ setAlert } as any}>
          <OrgSettings />
        </AlertContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>,
  );
  return { setAlert, setUser };
}

describe("OrgSettings", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
    localStorage.clear();
  });

  it("shows a loading spinner while fetching", () => {
    setupApi();
    renderOrgSettings({ isSuperUser: true });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows a read-only notice and hides Save changes for a non-admin", async () => {
    setupApi();
    renderOrgSettings({ tenantRole: "employee", permissions: [] });
    expect(
      await screen.findByText(/You have read-only access/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Save changes", { selector: "span" }),
    ).not.toBeInTheDocument();
  });

  it("shows Save changes, disabled until a field is edited", async () => {
    setupApi();
    renderOrgSettings({ tenantRole: "admin" });
    await screen.findByLabelText("Paid Leaves / year");

    const saveBtn = screen
      .getByText("Save changes", { selector: "span" })
      .closest("button")!;
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Paid Leaves / year"), {
      target: { value: "15" },
    });
    expect(saveBtn).not.toBeDisabled();
  });

  it("shows 'Active since' once the fetched settings have an effectiveFrom date", async () => {
    setupApi({ active: { effectiveFrom: "2026-01-01T00:00:00Z" } });
    renderOrgSettings({ isSuperUser: true });
    expect(await screen.findByText(/Active since/)).toBeInTheDocument();
  });

  it("shows a pending-change banner with its scheduled date and note", async () => {
    setupApi({
      pending: [
        {
          id: "pend1",
          effectiveFrom: "2026-06-01T00:00:00Z",
          note: "FY26 leave update",
        },
      ],
    });
    renderOrgSettings({ isSuperUser: true });
    expect(await screen.findByText(/Pending change/)).toBeInTheDocument();
    expect(screen.getByText(/FY26 leave update/)).toBeInTheDocument();
  });

  it("saves a draft change and refreshes the user profile when applied immediately", async () => {
    setupApi();
    mockPut.mockResolvedValue({});
    mockGet.mockImplementation((url: string) => {
      if (url === "/tenant-settings")
        return Promise.resolve({ data: { data: { active: {}, pending: [] } } });
      if (url === "/profile")
        return Promise.resolve({
          data: {
            success: true,
            data: { user: { id: "u1", wfhEnabled: false } },
          },
        });
      return Promise.resolve({ data: {} });
    });
    const { setAlert, setUser } = renderOrgSettings({ tenantRole: "admin" });
    await screen.findByLabelText("Paid Leaves / year");

    fireEvent.change(screen.getByLabelText("Paid Leaves / year"), {
      target: { value: "15" },
    });
    fireEvent.click(screen.getByText("Save changes", { selector: "span" }));

    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/tenant-settings",
        expect.objectContaining({
          settings: expect.objectContaining({ paidLeavesPerYear: 15 }),
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Settings applied immediately.",
      }),
    );
    await waitFor(() => expect(setUser).toHaveBeenCalled());
  });

  it("cancels a pending change through its confirmation dialog", async () => {
    setupApi({
      pending: [
        { id: "pend1", effectiveFrom: "2026-06-01T00:00:00Z", note: null },
      ],
    });
    mockDelete.mockResolvedValue({});
    const { setAlert } = renderOrgSettings({ isSuperUser: true });
    await screen.findByText(/Pending change/);

    fireEvent.click(screen.getByText("Cancel", { selector: "span" }));
    expect(
      screen.getByText(/Cancel the pending change scheduled for/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel change", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/tenant-settings/pending/pend1"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        message: "Pending settings change cancelled.",
      }),
    );
  });

  it("switches sub-tabs, updating the URL and localStorage", async () => {
    setupApi();
    renderOrgSettings({ isSuperUser: true });
    await screen.findByLabelText("Paid Leaves / year");

    fireEvent.click(screen.getByRole("tab", { name: /Attendance/ }));
    expect(await screen.findByText(/Work Start Time/)).toBeInTheDocument();
    expect(localStorage.getItem("org_settings_subtab")).toBe("attendance");
  });

  it("deep-links directly to a sub-tab via ?subtab=", async () => {
    setupApi();
    renderOrgSettings(
      { isSuperUser: true },
      vi.fn(),
      vi.fn(),
      "/settings?subtab=exit-policy",
    );
    expect(
      await screen.findByText("Stub ExitPolicySettings"),
    ).toBeInTheDocument();
  });
});
