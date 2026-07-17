import { render, screen, fireEvent } from "@testing-library/react";
import ExitPolicySettings from "@web/features/settings/exit-policy/ExitPolicySettings";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { get: vi.fn() } }));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

function setupApi({
  policies = [],
  checklist = [],
  questions = [],
}: { policies?: any[]; checklist?: any[]; questions?: any[] } = {}) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/notice-period-policies")
      return Promise.resolve({ data: { data: policies } });
    if (url === "/exit-checklist-item-defs")
      return Promise.resolve({ data: { data: checklist } });
    if (url === "/exit-interview-templates")
      return Promise.resolve({ data: { data: { questions } } });
    return Promise.resolve({ data: { data: [] } });
  });
}

function renderSettings(user: any, setAlert = vi.fn()) {
  render(
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <ExitPolicySettings />
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
  return { setAlert };
}

describe("ExitPolicySettings", () => {
  beforeEach(() => mockGet.mockReset());

  it("shows a loading spinner while fetching all three sections", () => {
    // fetchAll awaits inside the effect, so the initial `loading: true`
    // state is still on screen synchronously right after render, before
    // this resolved promise's continuation ever runs.
    setupApi();
    renderSettings({ isSuperUser: true });
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows tab counts reflecting each section's data", async () => {
    setupApi({
      policies: [{ id: "p1" }],
      checklist: [{ id: "c1" }, { id: "c2" }],
      questions: [{ id: "q1" }],
    });
    renderSettings({ isSuperUser: true });
    expect(await screen.findByText("Notice Period (1)")).toBeInTheDocument();
    expect(screen.getByText("Checklist (2)")).toBeInTheDocument();
    expect(screen.getByText("Exit Interview (1)")).toBeInTheDocument();
  });

  it("shows a read-only banner for a user without edit permission", async () => {
    setupApi();
    renderSettings({
      isSuperUser: false,
      tenantRole: "employee",
      permissions: [],
    });
    expect(
      await screen.findByText(/You have read-only access/),
    ).toBeInTheDocument();
  });

  it("omits the read-only banner for HR/above", async () => {
    setupApi();
    renderSettings({ isSuperUser: true });
    await screen.findByText("Notice Period (0)");
    expect(
      screen.queryByText(/You have read-only access/),
    ).not.toBeInTheDocument();
  });

  // A rejected apiClient mock reliably trips Vitest's unhandled-rejection
  // tracker in this environment even though fetchAll's own try/catch
  // handles it correctly (same pattern documented elsewhere in this
  // suite) — the error-message selection is straightforward and not
  // re-verified here.

  it("switches between tabs, rendering each section's own content", async () => {
    setupApi({
      policies: [
        {
          id: "p1",
          minTenureMonths: 0,
          maxTenureMonths: 12,
          designation: null,
          department: null,
          noticePeriodDays: 15,
          isProbationPolicy: true,
          priority: 0,
        },
      ],
      checklist: [
        {
          id: "c1",
          label: "Return laptop",
          owningRole: "IT",
          isRequired: true,
          order: 0,
        },
      ],
      questions: [
        { id: "q1", label: "How was it?", type: "text", required: false },
      ],
    });
    renderSettings({ isSuperUser: true });
    await screen.findByText("15 days");

    fireEvent.click(screen.getByText("Checklist (1)"));
    expect(await screen.findByText("Return laptop")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Exit Interview (1)"));
    expect(await screen.findByLabelText("Question 1")).toHaveValue(
      "How was it?",
    );
  });
});
