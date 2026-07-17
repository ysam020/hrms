import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PendingApprovals from "@web/features/dashboard/PendingApprovals";
import {
  ApprovalsBadgeContext,
  type PendingApprovalItem,
} from "@web/app/providers/ApprovalsBadgeContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const future = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderWith(items: PendingApprovalItem[], loading = false) {
  return render(
    <MemoryRouter future={future}>
      <ApprovalsBadgeContext.Provider
        value={{
          pendingApprovalsCount: items.length,
          pendingApprovalItems: items,
          loadingPendingApprovals: loading,
          refetchPendingApprovals: vi.fn(),
        }}
      >
        <PendingApprovals />
      </ApprovalsBadgeContext.Provider>
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

describe("PendingApprovals", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("shows loading skeletons when loading and no items are cached yet", () => {
    renderWith([], true);
    expect(screen.queryByText("Pending Approvals")).toBeInTheDocument();
    expect(screen.queryByText("All clear")).not.toBeInTheDocument();
  });

  it('shows "All clear" and the empty state when there are no pending items', () => {
    renderWith([], false);
    expect(screen.getByText("All clear")).toBeInTheDocument();
    expect(screen.getByText("No pending approvals")).toBeInTheDocument();
  });

  it("shows the item count badge when there are pending items", () => {
    renderWith([leaveItem]);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders a module label chip for a chain-approval item", () => {
    renderWith([leaveItem]);
    expect(screen.getByText("Leave")).toBeInTheDocument();
    expect(screen.getByText(leaveItem.summary)).toBeInTheDocument();
  });

  it("routes a KYC item to the employee's KYC view", () => {
    renderWith([kycItem]);
    fireEvent.click(
      screen.getByLabelText(`Pending approval: ${kycItem.summary}`),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/view-kyc/jdoe");
  });

  it("routes a join-request item to the settings join-requests tab", () => {
    renderWith([joinRequestItem]);
    fireEvent.click(
      screen.getByLabelText(`Pending approval: ${joinRequestItem.summary}`),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/settings?tab=join-requests");
  });

  it("routes a generic chain-approval item to the approvals inbox", () => {
    renderWith([leaveItem]);
    fireEvent.click(
      screen.getByLabelText(`Pending approval: ${leaveItem.summary}`),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/approvals");
  });

  it("supports keyboard activation via Enter", () => {
    renderWith([leaveItem]);
    fireEvent.keyDown(
      screen.getByLabelText(`Pending approval: ${leaveItem.summary}`),
      { key: "Enter" },
    );
    expect(mockNavigate).toHaveBeenCalledWith("/approvals");
  });

  it("only renders the first 5 items even when more are pending", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...leaveItem,
      instanceId: `i${i}`,
      summary: `Summary ${i}`,
    }));
    renderWith(many);
    expect(screen.getByText("8")).toBeInTheDocument(); // badge shows the real total
    expect(screen.getByText("Summary 0")).toBeInTheDocument();
    expect(screen.getByText("Summary 4")).toBeInTheDocument();
    expect(screen.queryByText("Summary 5")).not.toBeInTheDocument();
  });

  it("falls back to the requester's name when summary is empty", () => {
    renderWith([{ ...leaveItem, summary: "" }]);
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
  });

  it("falls back to the raw module string for an unmapped module label", () => {
    renderWith([{ ...leaveItem, module: "some_new_module" }]);
    expect(screen.getByText("some_new_module")).toBeInTheDocument();
  });
});
