import { render, screen, waitFor, act } from "@testing-library/react";
import {
  ApprovalsBadgeProvider,
  ApprovalsBadgeContext,
} from "@web/app/providers/ApprovalsBadgeContext";
import { UserContext } from "@web/app/providers/UserContext";
import { useContext } from "react";
import apiClient from "@web/core/http/axiosConfig";
import useSocketEvent from "@web/shared/hooks/useSocketEvent";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { get: vi.fn() } }));
const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useSocketEvent", () => ({ default: vi.fn() }));
const mockUseSocketEvent = useSocketEvent as unknown as ReturnType<
  typeof vi.fn
>;

function Probe() {
  const {
    pendingApprovalsCount,
    pendingApprovalItems,
    loadingPendingApprovals,
  } = useContext(ApprovalsBadgeContext);
  return (
    <div>
      <span>count: {pendingApprovalsCount}</span>
      <span>loading: {String(loadingPendingApprovals)}</span>
      <span>
        items: {pendingApprovalItems.map((i: any) => i.instanceId).join(",")}
      </span>
    </div>
  );
}

function renderWith(user: any) {
  return render(
    <UserContext.Provider value={{ user } as any}>
      <ApprovalsBadgeProvider>
        <Probe />
      </ApprovalsBadgeProvider>
    </UserContext.Provider>,
  );
}

describe("ApprovalsBadgeContext", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockUseSocketEvent.mockReset();
  });

  it("does not fetch when there is no logged-in user", () => {
    renderWith(null);
    expect(mockGet).not.toHaveBeenCalled();
    expect(screen.getByText("count: 0")).toBeInTheDocument();
  });

  it("fetches pending approvals for a logged-in user and exposes the count", async () => {
    mockGet.mockResolvedValue({
      data: { data: [{ instanceId: "i1" }, { instanceId: "i2" }] },
    });
    renderWith({ id: "u1" });

    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith("/approvals/pending-all"),
    );
    expect(await screen.findByText("count: 2")).toBeInTheDocument();
    expect(screen.getByText("items: i1,i2")).toBeInTheDocument();
  });

  it("falls back to an empty list when the response data isn't an array", async () => {
    mockGet.mockResolvedValue({ data: { data: null } });
    renderWith({ id: "u1" });
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(await screen.findByText("count: 0")).toBeInTheDocument();
  });

  it("keeps the last known items when a refetch fails", async () => {
    mockGet.mockResolvedValueOnce({ data: { data: [{ instanceId: "i1" }] } });
    renderWith({ id: "u1" });
    await screen.findByText("count: 1");

    mockGet.mockRejectedValueOnce(new Error("network error"));
    const handler = mockUseSocketEvent.mock.calls.find(
      (c) => c[0] === "notification",
    )![1];
    await act(async () => handler());

    expect(screen.getByText("count: 1")).toBeInTheDocument();
  });

  it("refetches when a 'notification' socket event fires", async () => {
    mockGet.mockResolvedValue({ data: { data: [{ instanceId: "i1" }] } });
    renderWith({ id: "u1" });
    await screen.findByText("count: 1");

    mockGet.mockResolvedValueOnce({
      data: { data: [{ instanceId: "i1" }, { instanceId: "i2" }] },
    });
    const handler = mockUseSocketEvent.mock.calls.find(
      (c) => c[0] === "notification",
    )![1];
    await act(async () => handler());

    expect(await screen.findByText("count: 2")).toBeInTheDocument();
  });
});
