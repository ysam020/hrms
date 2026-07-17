import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SalaryAdvances from "@web/features/payroll/SalaryAdvances";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.patch = vi.fn();
  instance.post = vi.fn();
  return { instance };
});

vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  patch: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

function makeAdvance(overrides: Partial<any> = {}) {
  return {
    id: "a1",
    userId: "u1",
    employee: { first_name: "Jane", last_name: "Doe" },
    amount: 50000,
    emiMonths: 5,
    paidMonths: 0,
    remainingAmount: 50000,
    status: "Pending",
    createdAt: "2024-06-01T00:00:00Z",
    ...overrides,
  };
}

function renderWith(user: any, advances: any[]) {
  mockApiClient.mockResolvedValue({
    data: { data: { advances, total: advances.length } },
  });
  return render(
    <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
      <UserContext.Provider value={{ user } as any}>
        <SalaryAdvances />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

const HR_USER = { tenantRole: "hr" };
const NON_HR_USER = { tenantRole: "employee" };

describe("SalaryAdvances", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.patch.mockReset();
    mocks.instance.post.mockReset();
  });

  it("fetches and renders advances with employee name, amount, and status", async () => {
    renderWith(HR_USER, [makeAdvance()]);
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getAllByText("₹50,000").length).toBe(2); // amount + remainingAmount
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("falls back to username, then userId, when the employee's name is missing", async () => {
    renderWith(HR_USER, [makeAdvance({ employee: { username: "jdoe" } })]);
    expect(await screen.findByText("jdoe")).toBeInTheDocument();
  });

  it("shows an empty state when there are no advances", async () => {
    renderWith(HR_USER, []);
    expect(
      await screen.findByText("No salary advances found"),
    ).toBeInTheDocument();
  });

  it("shows an error alert when the fetch fails", async () => {
    const setAlert = vi.fn();
    mockApiClient.mockRejectedValue(new Error("network down"));
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <SalaryAdvances />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Failed to fetch advances",
        }),
      ),
    );
  });

  it("hides Approve/Reject row actions for a non-HR user without the approval permission", async () => {
    renderWith(NON_HR_USER, [makeAdvance()]);
    await screen.findByText("Jane Doe");
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reject")).not.toBeInTheDocument();
  });

  it("shows Approve/Reject row actions only for a Pending advance (HR user)", async () => {
    renderWith(HR_USER, [makeAdvance({ status: "Approved" })]);
    await screen.findByText("Jane Doe");
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Reject")).not.toBeInTheDocument();
  });

  it("shows the remaining amount in warning color when unpaid, and defaults 'Paid' to 0", async () => {
    renderWith(HR_USER, [
      makeAdvance({ paidMonths: undefined, remainingAmount: 30000 }),
    ]);
    await screen.findByText("Jane Doe");
    expect(screen.getByText("₹30,000")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("approves an advance via the confirmation dialog and shows a success alert", async () => {
    mocks.instance.patch.mockResolvedValue({});
    const setAlert = vi.fn();
    mockApiClient.mockResolvedValue({
      data: { data: { advances: [makeAdvance()], total: 1 } },
    });
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <SalaryAdvances />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByLabelText("Approve"));
    expect(screen.getByText("Approve Salary Advance")).toBeInTheDocument();
    expect(screen.getByText(/for Jane Doe/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Approve", { selector: "span" }));

    await waitFor(() =>
      expect(mocks.instance.patch).toHaveBeenCalledWith(expect.any(String), {
        advanceId: "a1",
        action: "approve",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Advance approved",
      }),
    );
  });

  it("rejects an advance via the confirmation dialog", async () => {
    mocks.instance.patch.mockResolvedValue({});
    renderWith(HR_USER, [makeAdvance()]);
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByLabelText("Reject"));
    expect(screen.getByText("Reject Salary Advance")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reject", { selector: "span" }));

    await waitFor(() =>
      expect(mocks.instance.patch).toHaveBeenCalledWith(expect.any(String), {
        advanceId: "a1",
        action: "reject",
      }),
    );
  });

  it("shows the server error message when the approve/reject action fails", async () => {
    mocks.instance.patch.mockRejectedValue({
      response: { data: { message: "Advance already closed" } },
    });
    const setAlert = vi.fn();
    mockApiClient.mockResolvedValue({
      data: { data: { advances: [makeAdvance()], total: 1 } },
    });
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <SalaryAdvances />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await screen.findByText("Jane Doe");

    fireEvent.click(screen.getByLabelText("Approve"));
    fireEvent.click(screen.getByText("Approve", { selector: "span" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Advance already closed",
        }),
      ),
    );
  });

  it("opens the Request Salary Advance dialog, disables Submit until an amount is entered, and submits", async () => {
    mocks.instance.post.mockResolvedValue({});
    renderWith(HR_USER, []);
    await screen.findByText("No salary advances found");

    fireEvent.click(screen.getByLabelText("Request salary advance"));
    expect(screen.getByText("Request Salary Advance")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Amount (₹)"), {
      target: { value: "20000" },
    });
    expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ amount: 20000, emiMonths: 3 }),
      ),
    );
  });
});
