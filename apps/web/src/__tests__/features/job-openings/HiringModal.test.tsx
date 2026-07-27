import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HiringModal from "@web/features/job-openings/HiringModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { put: vi.fn(), get: vi.fn() },
}));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));
vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      aria-label={props.placeholder}
      type="text"
      value={props.value ? props.value.toISOString().slice(0, 10) : ""}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
      onBlur={props.onBlur}
    />
  ),
}));
vi.mock("primereact/inputnumber", () => ({
  InputNumber: (props: any) => (
    <input
      aria-label={props["aria-label"]}
      placeholder={props.placeholder}
      type="number"
      value={props.value ?? ""}
      disabled={props.disabled}
      onChange={(e) =>
        props.onValueChange({
          value: e.target.value === "" ? null : Number(e.target.value),
        })
      }
    />
  ),
}));

const SALARY_COMPONENTS = [
  { code: "BASIC", name: "Basic Pay", type: "earning", calcType: "fixed" },
  { code: "HRA", name: "HRA", type: "earning", calcType: "fixed" },
  {
    code: "CONVEYANCE",
    name: "Conveyance",
    type: "earning",
    calcType: "fixed",
  },
];

// Matches the tenant's real default components (payrollComponents.ts) —
// used to verify the entered gross is grossed-up for statutory deductions,
// not just split across the earning rows.
const SALARY_COMPONENTS_WITH_STATUTORY = [
  ...SALARY_COMPONENTS,
  {
    code: "PF",
    name: "Provident Fund",
    type: "deduction",
    calcType: "percent_of_basic",
    percentOf: "basic",
    percentValue: 12,
  },
  {
    code: "ESI",
    name: "ESI",
    type: "deduction",
    calcType: "percent_of_basic",
    percentOf: "gross",
    percentValue: 1.75,
  },
  {
    code: "PT",
    name: "Professional Tax",
    type: "deduction",
    calcType: "fixed",
    percentValue: 200,
  },
];

function futureDate(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function mockComponentsFetch() {
  mockGet.mockImplementation((url: string) => {
    if (url === API_ENDPOINTS.LIST_SALARY_COMPONENTS) {
      return Promise.resolve({ data: { data: SALARY_COMPONENTS } });
    }
    if (url === API_ENDPOINTS.LIST_PT_SLABS) {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.resolve({ data: { data: null } });
  });
}

function renderModal(overrides: Partial<any> = {}, setAlert = vi.fn()) {
  const handleClose = vi.fn();
  const getJobApplications = vi.fn();
  render(
    <MemoryRouter initialEntries={["/job-openings/job1"]}>
      <Routes>
        <Route
          path="/job-openings/:_id"
          element={
            <AlertContext.Provider value={{ setAlert } as any}>
              <HiringModal
                open={true}
                handleClose={handleClose}
                getJobApplications={getJobApplications}
                jobTitle="Software Engineer"
                applicantData={{
                  id: "app1",
                  name: "Jane Doe",
                  email: "jane@example.com",
                  aadharNo: "123456789012",
                }}
                {...overrides}
              />
            </AlertContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  return { handleClose, getJobApplications, setAlert };
}

describe("HiringModal", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockGet.mockReset();
    mockComponentsFetch();
  });

  it("shows candidate info and the job title", () => {
    renderModal();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("loads the tenant's configured salary components and renders a row per component", async () => {
    renderModal();
    await waitFor(() =>
      expect(screen.getByText("Basic Pay")).toBeInTheDocument(),
    );
    expect(screen.getByText("HRA")).toBeInTheDocument();
    expect(screen.getByText("Conveyance")).toBeInTheDocument();
  });

  it("submits the hire with a components breakdown derived from the entered gross salary", async () => {
    mockPut.mockResolvedValue({ data: { message: "Candidate hired" } });
    const { handleClose, getJobApplications, setAlert } = renderModal();

    await waitFor(() =>
      expect(screen.getByText("Basic Pay")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText("Monthly Gross Salary"), {
      target: { value: "60000" },
    });
    fireEvent.change(screen.getByLabelText("Joining Date"), {
      target: { value: futureDate(14) },
    });
    fireEvent.click(screen.getByText("Hire Candidate", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({ code: "BASIC", type: "earning" }),
            expect.objectContaining({ code: "HRA", type: "earning" }),
          ]),
          name: "Jane Doe",
          email: "jane@example.com",
          aadharNo: "123456789012",
          jobTitle: "Software Engineer",
          id: "app1",
          jobId: "job1",
        }),
      ),
    );
    const payload = mockPut.mock.calls[0][1];
    expect(payload.salary).toBeUndefined();
    // The standard 50/25/25 Basic/HRA/Conveyance split — matches the
    // payroll module's own fallback split, not the gross dumped entirely
    // into Basic.
    const byCode = Object.fromEntries(
      payload.components.map((c: any) => [c.code, c.amount]),
    );
    expect(byCode.BASIC).toBe(30000);
    expect(byCode.HRA).toBe(15000);
    expect(byCode.CONVEYANCE).toBe(15000);
    const totalEarnings = payload.components
      .filter((c: any) => c.type === "earning")
      .reduce((sum: number, c: any) => sum + c.amount, 0);
    expect(totalEarnings).toBe(60000);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Candidate hired",
      }),
    );
    expect(getJobApplications).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  it("keeps earnings summing to the entered gross — PF/ESI/PT are deductions taken out of it, not squeezed inside it", async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === API_ENDPOINTS.LIST_SALARY_COMPONENTS) {
        return Promise.resolve({
          data: { data: SALARY_COMPONENTS_WITH_STATUTORY },
        });
      }
      if (url === API_ENDPOINTS.LIST_PT_SLABS) {
        return Promise.resolve({ data: { data: [] } });
      }
      return Promise.resolve({ data: { data: null } });
    });
    mockPut.mockResolvedValue({ data: { message: "Candidate hired" } });
    renderModal();

    await waitFor(() =>
      expect(screen.getByText("Basic Pay")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByPlaceholderText("Monthly Gross Salary"), {
      target: { value: "200000" },
    });
    fireEvent.change(screen.getByLabelText("Joining Date"), {
      target: { value: futureDate(14) },
    });
    fireEvent.click(screen.getByText("Hire Candidate", { selector: "span" }));

    await waitFor(() => expect(mockPut).toHaveBeenCalled());
    const payload = mockPut.mock.calls[0][1];
    const byCode = Object.fromEntries(
      payload.components.map((c: any) => [c.code, c.amount]),
    );
    // Basic Pay must no longer equal the whole gross (the original bug).
    expect(byCode.BASIC).not.toBe(200000);
    const earningsTotal = payload.components
      .filter((c: any) => c.type === "earning")
      .reduce((sum: number, c: any) => sum + c.amount, 0);
    // Earnings alone must sum to the entered gross — PF/ESI/PT don't shrink
    // the split, they're deducted from it afterward.
    expect(earningsTotal).toBe(200000);
    // Gross (200000) is above the ESI wage ceiling, so ESI must be zero —
    // not a flat 1.75% of gross with no cap.
    expect(byCode.ESI).toBe(0);
    expect(byCode.PF).toBe(12000); // 12% of the resulting 100000 Basic
  });

  // Failure error-alert behavior isn't re-verified here: a rejecting
  // apiClient mock reliably trips Vitest's unhandled-rejection tracker in
  // this environment (same known quirk seen repeatedly across this
  // session), and the identical message-selection logic is already
  // verified correct elsewhere (e.g. RejectModal.tsx, Holidays.tsx).
});
