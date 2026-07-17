import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ViewKycList from "@web/features/employee-kyc/ViewKycList";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

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

function makeKyc(overrides: Partial<any> = {}) {
  return {
    username: "jdoe",
    first_name: "Jane",
    middle_name: "",
    last_name: "Doe",
    department: "Engineering",
    designation: "SWE",
    employeeStatus: "Active",
    kyc_approval: "Pending",
    ...overrides,
  };
}

function renderWith(
  kycs: any[],
  { setAlert = vi.fn(), totalCount = kycs.length } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: { kycs, pagination: { totalCount } } },
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ViewKycList />
    </AlertContext.Provider>,
  );
}

describe("ViewKycList", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mockNavigate.mockClear();
  });

  it("renders employee rows with formatted name and department", async () => {
    renderWith([makeKyc()]);
    expect(await screen.findByText("Jane Doe (jdoe)")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
  });

  it("shows an empty message when there are no records", async () => {
    renderWith([]);
    expect(await screen.findByText("No KYC records found")).toBeInTheDocument();
  });

  it.each([
    ["approved", "Approved"],
    ["rejected", "Rejected"],
    ["pending", "Pending"],
    ["revision requested", "Revision Requested"],
    ["edit requested", "Edit Requested"],
    ["Some Unknown Status", "Pending"],
  ])("shows the '%s' status as the '%s' chip", async (status, label) => {
    renderWith([makeKyc({ kyc_approval: status })]);
    await screen.findByText("Jane Doe (jdoe)");
    expect(screen.getByText(label, { selector: "span" })).toBeInTheDocument();
  });

  it("navigates to the individual KYC page when a row is clicked", async () => {
    renderWith([makeKyc()]);
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByText("Jane Doe (jdoe)"));

    expect(mockNavigate).toHaveBeenCalledWith("/view-kyc/jdoe");
  });

  it("refetches when the status filter changes", async () => {
    renderWith([makeKyc()]);
    await screen.findByText("Jane Doe (jdoe)");
    mocks.instance.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "Approved" },
    });

    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("status=Approved"),
      ),
    );
  });

  it("debounces the search filter before refetching", async () => {
    vi.useFakeTimers();
    renderWith([makeKyc()]);
    await vi.waitFor(() => expect(mocks.instance).toHaveBeenCalled());
    mocks.instance.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Search employees…"), {
      target: { value: "jane" },
    });
    expect(mocks.instance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("search=jane"),
      ),
    );
  });
});
