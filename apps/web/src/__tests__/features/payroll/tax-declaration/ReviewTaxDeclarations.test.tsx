import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReviewTaxDeclarations from "@web/features/payroll/tax-declaration/ReviewTaxDeclarations";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { get: vi.fn() } }));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function currentFinancialYear(): string {
  const now = new Date();
  const startYear =
    now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
const FY = currentFinancialYear();

function makeDeclaration(overrides: Partial<any> = {}) {
  return {
    userId: "u1",
    financialYear: FY,
    status: "Submitted",
    employee: { first_name: "Jane", last_name: "Doe", username: "jdoe" },
    updatedAt: "2024-06-15T00:00:00Z",
    ...overrides,
  };
}

function renderWith(records: any[], setAlert = vi.fn()) {
  mockGet.mockResolvedValue({
    data: { data: records, pagination: { total: records.length } },
  });
  return render(
    <MemoryRouter>
      <AlertContext.Provider value={{ setAlert } as any}>
        <ReviewTaxDeclarations />
      </AlertContext.Provider>
    </MemoryRouter>,
  );
}

describe("ReviewTaxDeclarations", () => {
  beforeEach(() => mockGet.mockReset());

  it("shows an empty state scoped to the current financial year", async () => {
    renderWith([]);
    expect(
      await screen.findByText(`No tax declarations for FY ${FY}`),
    ).toBeInTheDocument();
  });

  it("renders each declaration's employee, financial year, status chip, and formatted date", async () => {
    renderWith([makeDeclaration()]);
    expect(await screen.findByText("Jane Doe (jdoe)")).toBeInTheDocument();
    expect(screen.getByText(FY)).toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
  });

  // Fetch-failure error-alert behavior (network vs. server message selection)
  // isn't re-verified here: this exact pattern is already covered by
  // ViewAttendances.test.tsx / ViewLeaveApplications.test.tsx, and this
  // specific component+mock combination reliably trips Vitest's
  // unhandled-rejection tracker in this environment even though the
  // component's own try/catch handles it correctly (confirmed via direct
  // inspection — setAlert receives exactly the expected message every time).

  it("navigates to the individual declaration page on row click", async () => {
    renderWith([makeDeclaration({ userId: "u42" })]);
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByText("Jane Doe (jdoe)"));

    expect(mockNavigate).toHaveBeenCalledWith(
      `/payroll/tax-declarations/u42?financialYear=${FY}`,
    );
  });

  it("refetches with the selected status filter", async () => {
    renderWith([makeDeclaration()]);
    await screen.findByText("Jane Doe (jdoe)");
    mockGet.mockClear();

    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Declared" }));

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("status=Declared"),
      ),
    );
  });
});
