import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ApprovalsInbox from "@web/features/approvals/ApprovalsInbox";
import { AlertContext } from "@web/app/providers/AlertContext";
import {
  ApprovalsBadgeContext,
  type PendingApprovalItem,
} from "@web/app/providers/ApprovalsBadgeContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const future = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderWith(
  items: PendingApprovalItem[],
  {
    loading = false,
    setAlert = vi.fn(),
    refetchPendingApprovals = vi.fn(),
  } = {},
) {
  return render(
    <MemoryRouter future={future}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <ApprovalsBadgeContext.Provider
          value={{
            pendingApprovalsCount: items.length,
            pendingApprovalItems: items,
            loadingPendingApprovals: loading,
            refetchPendingApprovals,
          }}
        >
          <ApprovalsInbox />
        </ApprovalsBadgeContext.Provider>
      </AlertContext.Provider>
    </MemoryRouter>,
  );
}

const leaveItem: PendingApprovalItem = {
  instanceId: "i1",
  module: "leave",
  entityId: "l1",
  stepOrder: 1,
  requestedBy: "u1",
  requestedByName: "Jane Doe",
  createdAt: new Date().toISOString(),
  summary: "Jane Doe applied for PL leave (2 days)",
  detail: {},
};

const kycItem: PendingApprovalItem = {
  instanceId: "i2",
  module: "kyc",
  kycAction: "approve",
  username: "jdoe",
  requestedByName: "Jane Doe",
  createdAt: new Date().toISOString(),
  summary: "Jane Doe submitted KYC",
};

const joinRequestItem: PendingApprovalItem = {
  instanceId: "i3",
  module: "join_request",
  requestedByName: "Bob Smith",
  createdAt: new Date().toISOString(),
  summary: "Bob Smith requested to join",
};

describe("ApprovalsInbox", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockPut.mockReset();
  });

  it("shows loading skeletons when loading and no items are cached yet", () => {
    renderWith([], { loading: true });
    expect(screen.getByText("Pending Approvals")).toBeInTheDocument();
    expect(
      screen.queryByText("Nothing waiting on you right now."),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no pending items", () => {
    renderWith([]);
    expect(
      screen.getByText("Nothing waiting on you right now."),
    ).toBeInTheDocument();
  });

  it("shows the item count badge when there are pending items", () => {
    renderWith([leaveItem]);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders inline Approve/Reject actions for a chain-approval item", () => {
    renderWith([leaveItem]);
    expect(
      screen.getByLabelText(`Approve ${leaveItem.summary}`),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(`Reject ${leaveItem.summary}`),
    ).toBeInTheDocument();
  });

  it("shows a Step chip when stepOrder is greater than 1", () => {
    renderWith([{ ...leaveItem, stepOrder: 2 }]);
    expect(screen.getByText("Step 2")).toBeInTheDocument();
  });

  it("does not show a Step chip for the first step", () => {
    renderWith([leaveItem]);
    expect(screen.queryByText(/^Step /)).not.toBeInTheDocument();
  });

  it("routes a KYC item to its dedicated review page instead of showing inline actions", () => {
    renderWith([kycItem]);
    expect(screen.queryByLabelText(/^Approve /)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(`Review ${kycItem.summary}`));
    expect(mockNavigate).toHaveBeenCalledWith("/view-kyc/jdoe");
  });

  it("routes a join-request item to the settings join-requests tab", () => {
    renderWith([joinRequestItem]);
    fireEvent.click(screen.getByLabelText(`Review ${joinRequestItem.summary}`));
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=join-requests");
  });

  it("supports keyboard activation via Enter for click-through items", () => {
    renderWith([kycItem]);
    fireEvent.keyDown(screen.getByLabelText(`Review ${kycItem.summary}`), {
      key: "Enter",
    });
    expect(mockNavigate).toHaveBeenCalledWith("/view-kyc/jdoe");
  });

  it("opens the decision dialog pre-filled for Approve", () => {
    renderWith([leaveItem]);
    fireEvent.click(screen.getByLabelText(`Approve ${leaveItem.summary}`));
    expect(screen.getByText("Approve request")).toBeInTheDocument();
    expect(screen.getAllByText(leaveItem.summary).length).toBeGreaterThan(0);
  });

  it("opens the decision dialog pre-filled for Reject", () => {
    renderWith([leaveItem]);
    fireEvent.click(screen.getByLabelText(`Reject ${leaveItem.summary}`));
    expect(screen.getByText("Reject request")).toBeInTheDocument();
  });

  it("submits an approval, shows a success alert, closes the dialog, and refetches", async () => {
    mockPut.mockResolvedValue({});
    const setAlert = vi.fn();
    const refetchPendingApprovals = vi.fn();
    renderWith([leaveItem], { setAlert, refetchPendingApprovals });

    fireEvent.click(screen.getByLabelText(`Approve ${leaveItem.summary}`));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        decision: "approved",
        comment: undefined,
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Request approved.",
      }),
    );
    expect(refetchPendingApprovals).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText("Approve request")).not.toBeInTheDocument(),
    );
  });

  it("includes the typed comment when submitting a rejection", async () => {
    mockPut.mockResolvedValue({});
    renderWith([leaveItem]);

    fireEvent.click(screen.getByLabelText(`Reject ${leaveItem.summary}`));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), {
      target: { value: "Not enough coverage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        decision: "rejected",
        comment: "Not enough coverage",
      }),
    );
  });

  it("shows the server error message and keeps the dialog open when the decision fails", async () => {
    mockPut.mockRejectedValue({
      response: { data: { message: "Already decided" } },
    });
    const setAlert = vi.fn();
    renderWith([leaveItem], { setAlert });

    fireEvent.click(screen.getByLabelText(`Approve ${leaveItem.summary}`));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Already decided",
        }),
      ),
    );
    expect(screen.getByText("Approve request")).toBeInTheDocument();
  });

  it("falls back to a generic error message when the server gives none", async () => {
    mockPut.mockRejectedValue(new Error("network down"));
    const setAlert = vi.fn();
    renderWith([leaveItem], { setAlert });

    fireEvent.click(screen.getByLabelText(`Approve ${leaveItem.summary}`));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Something went wrong." }),
      ),
    );
  });

  it("closes the dialog via Cancel without submitting", () => {
    renderWith([leaveItem]);
    fireEvent.click(screen.getByLabelText(`Approve ${leaveItem.summary}`));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Approve request")).not.toBeInTheDocument();
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("falls back to the raw module string for an unmapped module label", () => {
    renderWith([{ ...leaveItem, module: "some_new_module" }]);
    expect(screen.getByText("some_new_module")).toBeInTheDocument();
  });
});
