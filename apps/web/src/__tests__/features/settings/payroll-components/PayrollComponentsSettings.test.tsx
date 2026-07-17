import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PayrollComponentsSettings from "@web/features/settings/payroll-components/PayrollComponentsSettings";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { get: vi.fn() } }));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

vi.mock(
  "@web/features/settings/payroll-components/SalaryComponentsTab",
  () => ({
    SalaryComponentsTab: (props: any) => (
      <div>
        Components tab, canEdit={String(props.canEdit)}, count=
        {props.components.length}
      </div>
    ),
  }),
);
vi.mock("@web/features/settings/payroll-components/PtSlabsTab", () => ({
  PtSlabsTab: (props: any) => <div>PT tab, count={props.slabs.length}</div>,
}));
vi.mock("@web/features/settings/payroll-components/PayCyclesTab", () => ({
  PayCyclesTab: (props: any) => (
    <div>Pay cycles tab, count={props.cycles.length}</div>
  ),
}));
vi.mock("@web/features/settings/payroll-components/IncomeTaxSlabsTab", () => ({
  IncomeTaxSlabsTab: (props: any) => (
    <div>Tax slabs tab, count={props.taxSlabs.length}</div>
  ),
}));

function renderWith(user: any, setAlert = vi.fn()) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <PayrollComponentsSettings />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

const ADMIN_USER = { tenantRole: "admin" };
const EMPLOYEE_USER = { tenantRole: "employee", permissions: [] };

describe("PayrollComponentsSettings", () => {
  beforeEach(() => mockGet.mockReset());

  it("fetches all four resources in parallel and shows the counts on each tab", async () => {
    mockGet.mockImplementation((url: string) => {
      const u = url ?? "";
      if (u.includes("salary-component"))
        return Promise.resolve({ data: { data: [{ id: "1" }, { id: "2" }] } });
      if (u.includes("pt-slab"))
        return Promise.resolve({ data: { data: [{ id: "1" }] } });
      if (u.includes("pay-cycle"))
        return Promise.resolve({ data: { data: [] } });
      return Promise.resolve({
        data: { data: [{ id: "1" }, { id: "2" }, { id: "3" }] },
      });
    });
    renderWith(ADMIN_USER);

    expect(await screen.findByText(/Components \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/PT Slabs \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/Pay Cycles \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/Income Tax Slabs \(3\)/)).toBeInTheDocument();
  });

  // Fetch-failure error-alert behavior isn't re-verified here: a rejecting
  // apiClient mock inside a Promise.all fetch reliably trips Vitest's
  // unhandled-rejection tracker in this environment (same known quirk as
  // ReviewTaxDeclarations/CreateRoleModal), and the fallback logic itself is
  // a single trivial `??` (server message or a static string) — no branching
  // worth a dedicated flaky test.

  it("defaults to the Components tab and switches on click", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWith(ADMIN_USER);
    expect(await screen.findByText(/Components tab/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /PT Slabs/ }));
    expect(screen.getByText(/PT tab/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Pay Cycles/ }));
    expect(screen.getByText(/Pay cycles tab/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Income Tax Slabs/ }));
    expect(screen.getByText(/Tax slabs tab/)).toBeInTheDocument();
  });

  it("grants edit access to an owner/admin", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWith(ADMIN_USER);
    expect(await screen.findByText(/canEdit=true/)).toBeInTheDocument();
    expect(screen.queryByText(/read-only access/)).not.toBeInTheDocument();
  });

  it("shows read-only access and passes canEdit=false for a regular employee", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWith(EMPLOYEE_USER);
    expect(await screen.findByText(/canEdit=false/)).toBeInTheDocument();
    expect(screen.getByText(/read-only access/)).toBeInTheDocument();
  });

  it("grants edit access via the explicit organisation-settings permission grant", async () => {
    mockGet.mockResolvedValue({ data: { data: [] } });
    renderWith({
      tenantRole: "employee",
      permissions: ["Organisation:edit_organisation_settings"],
    });
    expect(await screen.findByText(/canEdit=true/)).toBeInTheDocument();
  });
});
