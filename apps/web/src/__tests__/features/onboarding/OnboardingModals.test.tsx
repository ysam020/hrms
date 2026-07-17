import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OnboardingModals from "@web/features/onboarding/OnboardingModals";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), put: vi.fn() },
}));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderModals(user: any = { tenantId: "t1", tenantRole: "owner" }) {
  return render(
    <MemoryRouter>
      <UserContext.Provider
        value={{ user, setUser: vi.fn(), handleLogout: vi.fn() } as any}
      >
        <OnboardingModals />
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("OnboardingModals", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPut.mockReset();
    mockNavigate.mockReset();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing for a non-owner/admin user", () => {
    mockGet.mockResolvedValue({ data: { data: { itemStatus: {} } } });
    const { container } = renderModals({
      tenantId: "t1",
      tenantRole: "employee",
    });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing once every step is already resolved", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: {
          itemStatus: {
            company_info: "completed",
            org_settings: "completed",
            leave_policy: "completed",
            exit_policy: "completed",
            approvals: "completed",
            recruitment_pipeline: "completed",
            payroll_components: "skipped",
          },
        },
      },
    });
    const { container } = renderModals();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("auto-opens the checklist 1.2s after resolving with unresolved steps, and completes the first one", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue({ data: { data: { itemStatus: {} } } });
    mockPut.mockResolvedValue({ data: { success: true } });

    renderModals();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(
      screen.getByText("Welcome! Let's get you set up"),
    ).toBeInTheDocument();
    expect(screen.getByText("Set up your company profile")).toBeInTheDocument();
    expect(screen.getByText("1 of 7")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Set up company info" }),
    );

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/onboarding-checklist/company_info",
        {
          status: "completed",
        },
      ),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/settings"));
    expect(localStorage.getItem("onboarding_checklist_t1")).toContain(
      "company_info",
    );
  });

  it("BUG: skipping the last unresolved step never shows the post-skip hint, because the component unmounts itself", async () => {
    // OnboardingModals.tsx has `if (!isEligible || unresolved.length === 0) return null;`
    // at the top level. handleSkip() sets hintOpen(true) synchronously, but on the very
    // next render `unresolved` recomputes to length 0 (the just-skipped item now has a
    // status), so the early-return guard unmounts the whole tree — hint dialog included.
    // This asserts the actual (buggy) behavior rather than the intended one.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue({
      data: {
        data: {
          itemStatus: {
            company_info: "completed",
            org_settings: "completed",
            leave_policy: "completed",
            exit_policy: "completed",
            approvals: "completed",
            recruitment_pipeline: "completed",
            // payroll_components left unresolved
          },
        },
      },
    });
    mockPut.mockResolvedValue({ data: { success: true } });

    renderModals();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(screen.getByText("Review payroll components")).toBeInTheDocument();
    expect(screen.getByText("7 of 7")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Defaults are fine" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/onboarding-checklist/payroll_components",
        {
          status: "skipped",
        },
      ),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("No problem — you can do it later"),
      ).not.toBeInTheDocument(),
    );
  });

  it("does not close early: skipping a non-final step keeps the modal open on the next unresolved item", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGet.mockResolvedValue({ data: { data: { itemStatus: {} } } });
    mockPut.mockResolvedValue({ data: { success: true } });

    renderModals();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(screen.getByText("Set up your company profile")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "I'll do it later" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/onboarding-checklist/company_info",
        {
          status: "skipped",
        },
      ),
    );
    expect(
      await screen.findByText("Configure organisation settings"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No problem — you can do it later"),
    ).not.toBeInTheDocument();
  });
});
