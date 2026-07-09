import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { UserContext } from "./UserContext";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";

// Approval-chain resolution has no dedicated push event (unlike chat's
// socket-driven unread counts), so the badge is kept fresh by polling plus
// an explicit refetch from ApprovalsInbox right after an approve/reject.
const POLL_INTERVAL_MS = 60_000;

export const ApprovalsBadgeContext = createContext<{
  pendingApprovalsCount: number;
  refetchPendingApprovals: () => void;
}>({ pendingApprovalsCount: 0, refetchPendingApprovals: () => {} });

export function ApprovalsBadgeProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(UserContext);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const api = useApiClient();

  const fetchPendingCount = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(API_ENDPOINTS.GET_PENDING_APPROVALS);
      const items = res.data?.data;
      setPendingApprovalsCount(Array.isArray(items) ? items.length : 0);
    } catch {
      // silent — badge just keeps its last known count until the next poll
    }
  }, [user?.id, api]);

  useEffect(() => {
    if (!user?.id) return;
    fetchPendingCount();
    const intervalId = setInterval(fetchPendingCount, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [user?.id, fetchPendingCount]);

  return (
    <ApprovalsBadgeContext.Provider
      value={{
        pendingApprovalsCount,
        refetchPendingApprovals: fetchPendingCount,
      }}
    >
      {children}
    </ApprovalsBadgeContext.Provider>
  );
}
