import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { instantiateApproval } from "@hrms/approval-engine";
import { MESSAGES } from "../constants/messages";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";
import {
  findPolicy,
  getBalanceRow,
  getTrackedRemaining,
  isCompOffLeaveType,
  getAvailableCompOffDays,
  type LeavePolicy,
} from "./leaveBalanceHelpers";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

// ─── Tenant-settings helpers ──────────────────────────────────────────────────

const SETTINGS_CACHE_TTL = 900; // 15 min

const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5]; // Mon-Fri — matches the previous hardcoded weekend exclusion

/**
 * Returns the active leave-policy settings from the DB.
 * Active = latest version where effectiveFrom ≤ now.
 * Returns null when no settings record has been created yet.
 */
async function getLeaveSettings(tenantId: string) {
  const cacheKey = `tenantSettings:leave:${tenantId}`;
  const cached = await cacheManager.get(cacheKey);
  if (cached) return cached as any;

  const settings = await (prisma as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: {
      medicalCertRequired: true,
      customLeaveTypes: true,
      leavePolicies: true,
      workWeekPattern: true,
    },
  });

  if (!settings) return null;

  const result = {
    medicalCertRequired: settings.medicalCertRequired as boolean,
    customLeaveTypes: (settings.customLeaveTypes as any[]) ?? [],
    leavePolicies: (settings.leavePolicies as LeavePolicy[]) ?? [],
    workingDays:
      (settings.workWeekPattern as any)?.workingDays ?? DEFAULT_WORKING_DAYS,
  };
  await cacheManager.set(cacheKey, result, "system", SETTINGS_CACHE_TTL);
  return result;
}

dayjs.extend(utc);

function calculateWorkingDays(
  from: dayjs.Dayjs,
  to: dayjs.Dayjs,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
): number {
  let count = 0;
  let cur = from.startOf("day");
  const end = to.startOf("day");
  while (!cur.isAfter(end)) {
    if (workingDays.includes(cur.day())) count++;
    cur = cur.add(1, "day");
  }
  return count;
}

export const applyLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, leaveType, from, to, reason, sickLeave } = call.request;
    const unit: string = call.request.unit || "full_day";
    const session: string | undefined = call.request.session || undefined;
    const shortLeaveHours: number | undefined =
      call.request.shortLeaveHours || undefined;

    if (!userId || !leaveType || !from || !to) {
      return callback(null, {
        message: MESSAGES.USERNAME_LEAVE_TYPE_FROM_TO_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    if (!["full_day", "half_day", "short_leave"].includes(unit)) {
      return callback(null, {
        message: MESSAGES.INVALID_LEAVE_UNIT,
        status: status.INVALID_ARGUMENT,
      });
    }

    const startDay = dayjs.utc(from).startOf("day");
    const endDay = dayjs.utc(to).startOf("day");

    if (!startDay.isValid() || !endDay.isValid()) {
      return callback(null, {
        message: MESSAGES.INVALID_DATE_FORMAT,
        status: status.INVALID_ARGUMENT,
      });
    }

    if (endDay.isBefore(startDay)) {
      return callback(null, {
        message: MESSAGES.END_DATE_BEFORE_START,
        status: status.INVALID_ARGUMENT,
      });
    }

    const isSingleDay = startDay.isSame(endDay);
    if (unit === "half_day") {
      if (!isSingleDay || !session) {
        return callback(null, {
          message: MESSAGES.HALF_DAY_SESSION_REQUIRED,
          status: status.INVALID_ARGUMENT,
        });
      }
    }
    if (unit === "short_leave") {
      if (!isSingleDay || !shortLeaveHours || shortLeaveHours <= 0) {
        return callback(null, {
          message: MESSAGES.SHORT_LEAVE_HOURS_REQUIRED,
          status: status.INVALID_ARGUMENT,
        });
      }
    }

    // ── Tenant-settings enforcement ──────────────────────────────────────────
    const tenantId = getTenantId();
    let leaveSettings: Awaited<ReturnType<typeof getLeaveSettings>> = null;
    if (tenantId) {
      leaveSettings = await getLeaveSettings(tenantId);

      if (leaveSettings) {
        // 1. If custom leave types are configured, validate the requested type.
        if (leaveSettings.customLeaveTypes.length > 0) {
          const validKeys = leaveSettings.customLeaveTypes.flatMap((lt: any) =>
            [lt.key, lt.name].filter(Boolean),
          );
          // Always allow the built-in types — including Maternity/Paternity,
          // which the frontend offers unconditionally since Maternity Leave
          // is a statutory entitlement in India — plus anything defined in
          // leavePolicies, so tenants don't accidentally lock themselves out
          // while still migrating between the two config surfaces.
          validKeys.push(
            "PL",
            "SL",
            "CL",
            "Paid Leave",
            "Sick Leave",
            "Casual Leave",
            "MATERNITY",
            "Maternity Leave",
            "PATERNITY",
            "Paternity Leave",
            ...leaveSettings.leavePolicies.flatMap((p: LeavePolicy) =>
              [p.key, p.name].filter(Boolean),
            ),
          );

          if (
            !validKeys.some(
              (t: string) => t.toLowerCase() === leaveType.toLowerCase(),
            )
          ) {
            return callback(null, {
              message: `Invalid leave type "${leaveType}". Allowed: ${leaveSettings.customLeaveTypes
                .map((lt: any) => lt.name ?? lt.key)
                .join(", ")}`,
              status: status.INVALID_ARGUMENT,
            });
          }
        }

        // 2. Medical certificate required for sick leave.
        const { medicalCertificate } = call.request;
        if (
          sickLeave &&
          leaveSettings.medicalCertRequired &&
          !medicalCertificate
        ) {
          return callback(null, {
            message:
              "A medical certificate is required for sick leave in your organisation.",
            status: status.INVALID_ARGUMENT,
          });
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const existing = await prisma.leaveApplication.findMany({
      where: { userId, status: { in: ["Pending", "Approved"] } },
    });

    const overlap = existing.some((l) => {
      const lStart = dayjs.utc(l.from);
      const lEnd = dayjs.utc(l.to);
      return !startDay.isAfter(lEnd) && !endDay.isBefore(lStart);
    });

    if (overlap) {
      return callback(null, {
        message: MESSAGES.LEAVE_ALREADY_APPLIED,
        status: status.ALREADY_EXISTS,
      });
    }

    let days: number;
    if (unit === "half_day") {
      days = 0.5;
    } else if (unit === "short_leave") {
      days = Math.round((shortLeaveHours! / 8) * 100) / 100;
    } else {
      days = calculateWorkingDays(startDay, endDay, leaveSettings?.workingDays);
    }
    const fromDate = startDay.toDate();
    const toDate = endDay.toDate();

    // ── Exhaustion enforcement — opt-in and fail-open. Only applies when the
    // tenant has both (a) configured this leave type in leavePolicies with
    // onExhaustion="reject", and (b) already populated a numeric balance for
    // it. Tenants who haven't touched either see identical behavior to today.
    if (tenantId && leaveSettings) {
      const policy = findPolicy(leaveSettings.leavePolicies, leaveType);
      if (policy?.onExhaustion === "reject") {
        const balanceRow = await getBalanceRow(tenantId, userId);
        const remaining = getTrackedRemaining(balanceRow?.balances, leaveType);
        if (remaining !== null && days > remaining) {
          return callback(null, {
            message: `Insufficient ${policy.name || leaveType} balance — ${remaining} day(s) remaining, ${days} requested.`,
            status: status.FAILED_PRECONDITION,
          });
        }
      }
    }

    // Comp-off draws down against earned CompOffCredit rows, a separate pool
    // from the generic balances JSON — checked here for early feedback; the
    // credits are actually consumed on approval (see approveLeave.ts).
    if (tenantId && isCompOffLeaveType(leaveType)) {
      const available = await getAvailableCompOffDays(tenantId, userId);
      if (days > available) {
        return callback(null, {
          message: `Insufficient comp-off balance — ${available} day(s) available, ${days} requested.`,
          status: status.FAILED_PRECONDITION,
        });
      }
    }

    const leaveApplication = await prisma.leaveApplication.create({
      data: {
        tenantId: getTenantId()!,
        userId,
        leaveType,
        from: fromDate,
        to: toDate,
        days,
        reason: reason || "",
        sickLeave: sickLeave || false,
        status: "Pending",
        appliedOn: new Date(),
        unit,
        session: unit === "half_day" ? session : null,
        shortLeaveHours: unit === "short_leave" ? shortLeaveHours : null,
      },
    });

    await cacheManager.invalidatePattern("leaves:*");

    // Routes the approve/reject decision through the tenant's configured
    // Approval Chain (zero-config default: requester's reporting manager,
    // falling back to an owner/admin) — api-gateway's actOnApprovalForEntity
    // resolves this instance and drives approveLeave/rejectLeave once acted on.
    if (tenantId) {
      await instantiateApproval(
        tenantId,
        "leave",
        leaveApplication.id,
        userId,
        {
          days,
          unit,
        },
      );
    }

    const fromStr = startDay.format("YYYY-MM-DD");
    const toStr = endDay.format("YYYY-MM-DD");

    // Notify HR + team leaders (fire-and-forget)
    Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      }),
      prisma.user.findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      }),
      prisma.team.findMany({
        where: {
          OR: [{ members: { has: userId } }, { teamLeaderId: userId }],
        },
        select: { teamLeaderId: true },
      }),
    ])
      .then(async ([applicant, hrUsers, teams]) => {
        const applicantUsername = applicant?.username || userId;
        const teamLeaderIds = [
          ...new Set(
            teams.map((t) => t.teamLeaderId).filter((id) => id !== userId),
          ),
        ];
        const teamLeaderUsers =
          teamLeaderIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: teamLeaderIds } },
                select: { id: true, username: true },
              })
            : [];
        const allTargets = [...hrUsers, ...teamLeaderUsers];
        const uniqueIds = [...new Set(allTargets.map((u) => u.id))];
        const uniqueUsernames = [...new Set(allTargets.map((u) => u.username))];
        if (uniqueUsernames.length === 0) return;
        await getNotificationQueue().add("leaveApplied", {
          title: "Leave",
          message: `${applicantUsername} has applied for leave from ${fromStr} to ${toStr}`,
          recipients: uniqueIds,
          pushTargets: uniqueUsernames,
          eventType: "leave_notification",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.warn("[applyLeave] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.LEAVE_APPLIED,
      status: status.OK,
      data: toLeaveApplicationProto(leaveApplication),
    });
  } catch (err) {
    logger.error("ApplyLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
