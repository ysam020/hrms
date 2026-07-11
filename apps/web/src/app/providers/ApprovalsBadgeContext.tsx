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
import useSocketEvent from "@web/shared/hooks/useSocketEvent";

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
      // KYC submissions/edit-access requests aren't chain-engine instances
      // (see submitKyc.ts / allowKycEdit.ts), so they're a separate
      // endpoint — same split the dashboard's PendingApprovals widget
      // merges, kept in sync here so the sidebar badge count actually
      // matches what that widget shows.
      const [approvalsRes, kycRes] = await Promise.all([
        api.get(API_ENDPOINTS.GET_PENDING_APPROVALS),
        api.get(API_ENDPOINTS.GET_PENDING_KYC_APPROVALS),
      ]);
      const approvals = approvalsRes.data?.data;
      const kycRequests = kycRes.data?.data;
      const approvalsCount = Array.isArray(approvals) ? approvals.length : 0;
      const kycCount = Array.isArray(kycRequests) ? kycRequests.length : 0;
      setPendingApprovalsCount(approvalsCount + kycCount);
    } catch {
      // silent — badge just keeps its last known count until the next event
    }
  }, [user?.id, api]);

  useEffect(() => {
    if (!user?.id) return;
    fetchPendingCount();
  }, [user?.id, fetchPendingCount]);

  // Every event that can add or resolve a pending approval — leave applied,
  // resignation submitted, KYC edit requested/allowed, etc. — already goes
  // through notificationWorker.ts, which emits the generic "notification"
  // socket event to the relevant recipients (the same channel the bell/toast
  // system already relies on, see useNotifications.tsx). Reusing it here
  // means the badge updates live with no dedicated push event of its own and
  // no polling — the count is only ever as stale as the last relevant
  // notification this user actually received.
  useSocketEvent("notification", fetchPendingCount);

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
