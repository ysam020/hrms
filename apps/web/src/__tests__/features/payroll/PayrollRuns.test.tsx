import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import PayrollRuns from "@web/features/payroll/PayrollRuns";
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

function makeRun(overrides: Partial<any> = {}) {
  return {
    id: "r1",
    year: 2024,
    month: 6,
    status: "draft",
    employeeCount: 12,
    totalGross: 1200000,
    totalNet: 1000000,
    createdAt: "2024-06-01T00:00:00Z",
    approvedAt: null,
    disbursedAt: null,
    ...overrides,
  };
}

function renderWith(user: any, runs: any[]) {
  mockApiClient.mockResolvedValue({
    data: { data: { runs, total: runs.length } },
  });
  return render(
    <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
      <UserContext.Provider value={{ user } as any}>
        <PayrollRuns />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

const HR_USER = { tenantRole: "hr" };
const NON_HR_USER = { tenantRole: "employee" };

describe("PayrollRuns", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.patch.mockReset();
    mocks.instance.post.mockReset();
  });

  it("fetches and renders payroll runs with their period and status", async () => {
    renderWith(HR_USER, [makeRun()]);
    expect(await screen.findByText("June 2024")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("shows an empty state when there are no runs", async () => {
    renderWith(HR_USER, []);
    expect(
      await screen.findByText("No payroll runs found"),
    ).toBeInTheDocument();
  });

  it("shows an error alert when the fetch fails", async () => {
    const setAlert = vi.fn();
    mockApiClient.mockRejectedValue(new Error("network down"));
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <PayrollRuns />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Failed to fetch payroll runs",
        }),
      ),
    );
  });

  it("hides the Initiate button and row actions for a non-HR user", async () => {
    renderWith(NON_HR_USER, [makeRun({ status: "processing" })]);
    await screen.findByText("June 2024");
    expect(
      screen.queryByLabelText("Initiate payroll run"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument();
  });

  it("shows 'Submit for Approval' and 'Cancel' actions for a draft run (HR user)", async () => {
    renderWith(HR_USER, [makeRun({ status: "draft" })]);
    await screen.findByText("June 2024");
    expect(screen.getByLabelText("Submit for Approval")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel")).toBeInTheDocument();
    expect(screen.queryByLabelText("Approve")).not.toBeInTheDocument();
  });

  it("shows 'Approve' and 'Cancel' actions for a processing run", async () => {
    renderWith(HR_USER, [makeRun({ status: "processing" })]);
    await screen.findByText("June 2024");
    expect(screen.getByLabelText("Approve")).toBeInTheDocument();
    expect(screen.getByLabelText("Cancel")).toBeInTheDocument();
  });

  it("shows only 'Mark Disbursed' for an approved run", async () => {
    renderWith(HR_USER, [
      makeRun({ status: "approved", approvedAt: "2024-06-05T00:00:00Z" }),
    ]);
    await screen.findByText("June 2024");
    expect(screen.getByLabelText("Mark Disbursed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cancel")).not.toBeInTheDocument();
  });

  it("shows only 'Retry Payouts' for a disbursed run (in case some individual payouts failed)", async () => {
    renderWith(HR_USER, [
      makeRun({ status: "disbursed", disbursedAt: "2024-06-10T00:00:00Z" }),
    ]);
    await screen.findByText("June 2024");
    expect(screen.queryByLabelText("Mark Disbursed")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cancel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Retry Payouts")).toBeInTheDocument();
  });

  it("shows 'Retry Payouts' for a run whose disbursement job failed entirely", async () => {
    renderWith(HR_USER, [makeRun({ status: "disbursement_failed" })]);
    await screen.findByText("June 2024");
    expect(screen.getByLabelText("Retry Payouts")).toBeInTheDocument();
  });

  it("shows no row actions for a run currently disbursing", async () => {
    renderWith(HR_USER, [makeRun({ status: "disbursing" })]);
    await screen.findByText("June 2024");
    expect(screen.queryByLabelText("Retry Payouts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mark Disbursed")).not.toBeInTheDocument();
  });

  it("confirms and triggers a payout retry, showing the in-progress info alert", async () => {
    mocks.instance.post.mockResolvedValue({
      data: { message: "Retrying 2 outstanding payout(s)." },
    });
    const setAlert = vi.fn();
    mockApiClient.mockResolvedValue({
      data: {
        data: { runs: [makeRun({ status: "disbursed" })], total: 1 },
      },
    });
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <PayrollRuns />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await screen.findByText("June 2024");

    fireEvent.click(screen.getByLabelText("Retry Payouts"));
    expect(screen.getByText("Retry Payroll Payouts")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry Payouts"));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.stringContaining("/retry-payouts"),
      ),
    );
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "info",
          message: "Retrying 2 outstanding payout(s).",
        }),
      ),
    );
  });

  it("submits a draft run for approval directly (no confirmation dialog)", async () => {
    mocks.instance.patch.mockResolvedValue({});
    renderWith(HR_USER, [makeRun({ status: "draft" })]);
    await screen.findByText("June 2024");

    fireEvent.click(screen.getByLabelText("Submit for Approval"));

    await waitFor(() =>
      expect(mocks.instance.patch).toHaveBeenCalledWith(expect.any(String), {
        runId: "r1",
        status: "processing",
      }),
    );
  });

  it("requires confirmation before approving a processing run, warning it moves real money for disbursal", async () => {
    mocks.instance.patch.mockResolvedValue({});
    renderWith(HR_USER, [
      makeRun({ status: "approved", approvedAt: "2024-06-05T00:00:00Z" }),
    ]);
    await screen.findByText("June 2024");

    fireEvent.click(screen.getByLabelText("Mark Disbursed"));

    expect(screen.getByText("Mark Payroll Run Disbursed")).toBeInTheDocument();
    expect(
      screen.getByText(/move real money to employees/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Mark Disbursed"));

    await waitFor(() =>
      expect(mocks.instance.patch).toHaveBeenCalledWith(expect.any(String), {
        runId: "r1",
        status: "disbursed",
      }),
    );
  });

  it("shows an in-progress info alert (not a success alert) once disbursement is triggered, since it now completes in the background", async () => {
    mocks.instance.patch.mockResolvedValue({
      data: { message: "Payroll disbursement started." },
    });
    const setAlert = vi.fn();
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          runs: [
            makeRun({ status: "approved", approvedAt: "2024-06-05T00:00:00Z" }),
          ],
          total: 1,
        },
      },
    });
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <PayrollRuns />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await screen.findByText("June 2024");

    fireEvent.click(screen.getByLabelText("Mark Disbursed"));
    fireEvent.click(screen.getByText("Mark Disbursed"));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "info",
          message: "Payroll disbursement started.",
        }),
      ),
    );
  });

  it("polls two disbursing runs independently — starting the second poll doesn't cancel the first", async () => {
    mocks.instance.patch.mockResolvedValue({
      data: { message: "Payroll disbursement started." },
    });
    const setAlert = vi.fn();
    const runs = [
      makeRun({
        id: "r1",
        status: "approved",
        approvedAt: "2024-06-05T00:00:00Z",
      }),
      makeRun({
        id: "r2",
        month: 7,
        status: "approved",
        approvedAt: "2024-07-05T00:00:00Z",
      }),
    ];
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/payroll/runs/r1") {
        return Promise.resolve({ data: { data: { status: "disbursed" } } });
      }
      if (url === "/payroll/runs/r2") {
        return Promise.resolve({
          data: { data: { status: "disbursement_failed" } },
        });
      }
      return Promise.resolve({ data: { data: { runs, total: runs.length } } });
    });
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <PayrollRuns />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await screen.findByText("June 2024");
    await screen.findByText("July 2024");

    const disburseButtons = screen.getAllByLabelText("Mark Disbursed");
    expect(disburseButtons).toHaveLength(2);

    // Trigger run r1's poll, then — before it fires — trigger run r2's
    // poll. Without the per-run timeout map, starting r2's poll cancels
    // r1's pending timer and r1 never gets its settled-status toast.
    fireEvent.click(disburseButtons[0]);
    fireEvent.click(await screen.findByText("Mark Disbursed"));
    await waitFor(() => expect(mocks.instance.patch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getAllByLabelText("Mark Disbursed")[1]);
    fireEvent.click(await screen.findByText("Mark Disbursed"));
    await waitFor(() => expect(mocks.instance.patch).toHaveBeenCalledTimes(2));

    await waitFor(
      () => {
        expect(mockApiClient).toHaveBeenCalledWith("/payroll/runs/r1");
        expect(mockApiClient).toHaveBeenCalledWith("/payroll/runs/r2");
      },
      { timeout: 4000 },
    );
    await waitFor(
      () => {
        expect(setAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            severity: "success",
            message: expect.stringContaining("Payroll disbursed"),
          }),
        );
        expect(setAlert).toHaveBeenCalledWith(
          expect.objectContaining({
            severity: "error",
            message: expect.stringContaining("failed"),
          }),
        );
      },
      { timeout: 4000 },
    );
  }, 10000);

  it("cancels a run via the confirmation dialog and shows a success alert", async () => {
    mocks.instance.patch.mockResolvedValue({});
    const setAlert = vi.fn();
    mockApiClient.mockResolvedValue({
      data: { data: { runs: [makeRun({ status: "draft" })], total: 1 } },
    });
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <PayrollRuns />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await screen.findByText("June 2024");

    fireEvent.click(screen.getByLabelText("Cancel"));
    expect(screen.getByText("Cancel Payroll Run")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancel Run"));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "success",
          message: "Payroll run cancelled successfully",
        }),
      ),
    );
  });

  it("shows the server error message when an action fails", async () => {
    mocks.instance.patch.mockRejectedValue({
      response: { data: { message: "Run already locked" } },
    });
    const setAlert = vi.fn();
    mockApiClient.mockResolvedValue({
      data: { data: { runs: [makeRun({ status: "draft" })], total: 1 } },
    });
    render(
      <AlertContext.Provider value={{ setAlert } as any}>
        <UserContext.Provider value={{ user: HR_USER } as any}>
          <PayrollRuns />
        </UserContext.Provider>
      </AlertContext.Provider>,
    );
    await screen.findByText("June 2024");

    fireEvent.click(screen.getByLabelText("Submit for Approval"));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Run already locked",
        }),
      ),
    );
  });

  it("opens the run detail dialog on row click, with the status timeline", async () => {
    renderWith(HR_USER, [
      makeRun({ status: "approved", approvedAt: "2024-06-05T00:00:00Z" }),
    ]);
    await screen.findByText("June 2024");

    fireEvent.click(screen.getByText("June 2024"));

    expect(
      await screen.findByText("June 2024 Payroll Run"),
    ).toBeInTheDocument();
    expect(screen.getByText("Initiated")).toBeInTheDocument();
    expect(screen.getByText("Disbursed")).toBeInTheDocument();
  });

  it("opens the Initiate Payroll Run dialog for an HR user and submits it", async () => {
    mocks.instance.post.mockResolvedValue({});
    renderWith(HR_USER, []);
    await screen.findByText("No payroll runs found");

    fireEvent.click(screen.getByLabelText("Initiate payroll run"));
    expect(screen.getByText("Initiate Payroll Run")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Initiate" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
      ),
    );
  });
});
