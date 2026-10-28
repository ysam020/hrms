import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UserContext } from "./UserContext";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import useSocketEvent from "@web/shared/hooks/useSocketEvent";

export interface ChainApprovalItem {
  instanceId: string;
  module: string;
  entityId: string;
  stepOrder: number;
  requestedBy: string;
  requestedByName: string;
  createdAt: string;
  summary: string;
  detail: Record<string, unknown>;
}

export interface KycApprovalItem {
  instanceId: string;
  module: "kyc";
  kycAction: "approve" | "allow_edit";
  username: string;
  requestedByName: string;
  createdAt: string;
  summary: string;
}

export interface JoinRequestApprovalItem {
  instanceId: string;
  module: "join_request";
  requestedByName: string;
  createdAt: string;
  summary: string;
}

export type PendingApprovalItem =
  | ChainApprovalItem
  | KycApprovalItem
  | JoinRequestApprovalItem;

export const ApprovalsBadgeContext = createContext<{
  pendingApprovalsCount: number;
  pendingApprovalItems: PendingApprovalItem[];
  loadingPendingApprovals: boolean;
  refetchPendingApprovals: () => void;
}>({
  pendingApprovalsCount: 0,
  pendingApprovalItems: [],
  loadingPendingApprovals: false,
  refetchPendingApprovals: () => {},
});

export function ApprovalsBadgeProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(UserContext);
  const [pendingApprovalItems, setPendingApprovalItems] = useState<
    PendingApprovalItem[]
  >([]);
  const [loadingPendingApprovals, setLoadingPendingApprovals] = useState(false);
  // Discards a stale response if a newer fetch has already started (e.g.
  // React StrictMode's dev-only double-invoke of this effect on mount) —
  // otherwise whichever of the two duplicate requests happens to resolve
  // last wins, which is a coin flip rather than always the latest one.
  const requestIdRef = useRef(0);

  // Single source of truth for every "Pending Approvals" surface — sidebar
  // badge, dashboard widget, and the /approvals inbox all read from this one
  // context instead of each independently calling the same endpoints.
  // Previously each of the three fetched GET_PENDING_APPROVALS /
  // GET_PENDING_KYC_APPROVALS / GET_PENDING_JOIN_REQUESTS on their own —
  // hitting the same URL from multiple places at once collided with
  // apiClient's same-URL GET deduplication (axiosConfig.ts cancels an
  // in-flight request when a new one to the same URL starts), silently
  // dropping one caller's count. The server now aggregates all three into
  // one response (GET /approvals/pending-all) and this is the only place
  // that calls it.
  const fetchPendingItems = useCallback(async () => {
    if (!user?.id) return;
    const currentRequestId = ++requestIdRef.current;
    setLoadingPendingApprovals(true);
    try {
      const res = await apiClient.get(API_ENDPOINTS.GET_ALL_PENDING_APPROVALS);
      if (currentRequestId !== requestIdRef.current) return;
      const items = res.data?.data;
      setPendingApprovalItems(Array.isArray(items) ? items : []);
    } catch {
      // silent — keeps its last known items until the next event
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoadingPendingApprovals(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    fetchPendingItems();
  }, [user?.id, fetchPendingItems]);

  // Every event that can add or resolve a pending approval — leave applied,
  // resignation submitted, KYC edit requested/allowed, a join request
  // submitted, etc. — already goes through notificationWorker.ts, which
  // emits the generic "notification" socket event to the relevant
  // recipients (the same channel the bell/toast system already relies on,
  // see useNotifications.tsx). Reusing it here means everything updates
  // live with no dedicated push event of its own and no polling — the data
  // is only ever as stale as the last relevant notification this user
  // actually received.
  useSocketEvent("notification", fetchPendingItems);

  return (
    <ApprovalsBadgeContext.Provider
      value={{
        pendingApprovalsCount: pendingApprovalItems.length,
        pendingApprovalItems,
        loadingPendingApprovals,
        refetchPendingApprovals: fetchPendingItems,
      }}
    >
      {children}
    </ApprovalsBadgeContext.Provider>
  );
}
