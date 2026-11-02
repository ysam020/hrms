import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { apiClient } from "@next/lib/api";

// Leave HTTP calls used by the attendance screens. Request and response
// handling is exactly what the components did inline before; screens keep
// their own messages and alerts.

export type LeaveDecision = "approve" | "reject" | "cancel";

export interface LeaveListQuery {
  page: number;
  limit: number;
  status: string;
  futureOnly: boolean;
  search?: string;
}

/** One page of leave applications, normalised to { data, totalCount }. */
export async function listLeaveApplications({
  page,
  limit,
  status,
  futureOnly,
  search,
}: LeaveListQuery) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    status,
    futureOnly: String(futureOnly),
  });
  if (search) params.set("search", search);
  const res = await apiClient.get(
    API_ENDPOINTS.GET_LEAVE_APPLICATIONS(params.toString()),
  );
  const d = res.data;
  const records = d.data?.records ?? d.data ?? [];
  return {
    data: records,
    totalCount: d.data?.pagination?.totalCount ?? d.total ?? records.length,
  };
}

/** Approve, reject or withdraw one request. Throws on `success: false`. */
export async function updateLeaveStatus(
  leaveId: string,
  action: LeaveDecision,
): Promise<{ message?: string }> {
  const res = await apiClient.put(API_ENDPOINTS.UPDATE_LEAVE_STATUS, {
    leaveId,
    action,
  });
  if (!res.data?.success)
    throw new Error(res.data?.message || "The request couldn’t be updated.");
  return { message: res.data.message };
}

/** Decide several requests at once; the server reports each outcome. */
export async function bulkUpdateLeaveStatus(
  leaveIds: string[],
  action: LeaveDecision,
): Promise<{ succeeded: unknown[]; failed: unknown[]; message?: string }> {
  const res = await apiClient.put(API_ENDPOINTS.BULK_UPDATE_LEAVE_STATUS, {
    leaveIds,
    action,
  });
  return {
    succeeded: res.data?.data?.succeeded ?? [],
    failed: res.data?.data?.failed ?? [],
    message: res.data?.message,
  };
}
