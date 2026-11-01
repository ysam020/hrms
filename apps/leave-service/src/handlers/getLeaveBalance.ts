import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { getLeaveSettings } from "../utils/leaveSettings";
import {
  getTrackedRemaining,
  resolveAnnualQuota,
  isCompOffLeaveType,
  getAvailableCompOffDays,
  type LeavePolicy,
} from "./leaveBalanceHelpers";

const BUILTIN_TYPES = [
  { key: "PL", name: "Paid Leave" },
  { key: "SL", name: "Sick Leave" },
  { key: "CL", name: "Casual Leave" },
];

/**
 * Per-type "days remaining" summary, covering every leave type the tenant
 * has configured (built-in PL/SL/CL scalars, leavePolicies, customLeaveTypes)
 * — not just PL. Read-only: reflects the tracked balance once a type has been
 * seeded by ensureTrackedBalance (via an actual leave application), otherwise
 * falls back to the tenant's configured annual quota so the figure is never
 * just a blind 0 before someone's first application of that type.
 */
async function buildLeaveTypeSummary(
  tenantId: string | null | undefined,
  userId: string,
  rawBalances: unknown,
  leaveSettings: any,
): Promise<Record<string, { name: string; remaining: number }>> {
  const types = new Map<string, { key: string; name: string }>();
  const addType = (key?: string, name?: string) => {
    if (!key) return;
    const k = key.trim().toUpperCase();
    if (!k || types.has(k)) return;
    types.set(k, { key, name: name?.trim() || key });
  };
  BUILTIN_TYPES.forEach((t) => addType(t.key, t.name));
  (leaveSettings?.leavePolicies ?? []).forEach((p: LeavePolicy) =>
    addType(p.key, p.name),
  );
  (leaveSettings?.customLeaveTypes ?? []).forEach((t: any) =>
    addType(t.key, t.name),
  );

  const quotaSettings = {
    leavePolicies: leaveSettings?.leavePolicies ?? [],
    customLeaveTypes: leaveSettings?.customLeaveTypes ?? [],
    paidLeavesPerYear: leaveSettings?.paidLeavesPerYear ?? 12,
    sickLeavesPerYear: leaveSettings?.sickLeavesPerYear ?? 12,
    casualLeavesPerYear: leaveSettings?.casualLeavesPerYear ?? 6,
  };

  // Comp-off availability is the same figure for every comp-off type, so
  // it's fetched at most once.
  let compOff: Promise<number> | null = null;
  const summary: Record<string, { name: string; remaining: number }> = {};
  for (const { key, name } of types.values()) {
    if (isCompOffLeaveType(key, quotaSettings.leavePolicies)) {
      if (!tenantId) continue;
      compOff ??= getAvailableCompOffDays(tenantId, userId);
      summary[key] = { name, remaining: await compOff };
      continue;
    }
    const tracked = getTrackedRemaining(rawBalances, key);
    const remaining =
      tracked !== null ? tracked : resolveAnnualQuota(key, quotaSettings);
    if (remaining !== null) summary[key] = { name, remaining };
  }
  return summary;
}

export const getLeaveBalance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const tenantId = getTenantId();
    // Independent reads — one round trip instead of two in sequence.
    const [balance, leaveSettings] = await Promise.all([
      prisma.leaveBalance.findFirst({
        where: { tenantId, userId },
        orderBy: { id: "asc" },
      }),
      tenantId ? getLeaveSettings(tenantId) : null,
    ]);

    const summary = await buildLeaveTypeSummary(
      tenantId,
      userId,
      balance?.balances,
      leaveSettings,
    );

    const data = {
      id: balance?.id ?? "",
      userId,
      accumulatedPlBeforeCurrentMonth:
        balance?.accumulatedPLBeforeCurrentMonth ?? 0,
      balances: JSON.stringify(summary),
    };

    return callback(null, {
      message: balance ? MESSAGES.LEAVE_FETCHED : MESSAGES.NO_LEAVE_BALANCE,
      status: status.OK,
      data,
      userId,
    });
  } catch (err) {
    logger.error("GetLeaveBalance error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
