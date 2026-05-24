import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

// ─── Tenant-settings helpers ──────────────────────────────────────────────────

const SETTINGS_CACHE_TTL = 900; // 15 min

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
    },
  });

  if (!settings) return null;

  const result = {
    medicalCertRequired: settings.medicalCertRequired as boolean,
    customLeaveTypes: (settings.customLeaveTypes as any[]) ?? [],
  };
  await cacheManager.set(cacheKey, result, "system", SETTINGS_CACHE_TTL);
  return result;
}

dayjs.extend(utc);

function isWeekend(d: dayjs.Dayjs): boolean {
  const dow = d.day();
  return dow === 0 || dow === 6;
}

function calculateWorkingDays(from: dayjs.Dayjs, to: dayjs.Dayjs): number {
  let count = 0;
  let cur = from.startOf("day");
  const end = to.startOf("day");
  while (!cur.isAfter(end)) {
    if (!isWeekend(cur)) count++;
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

    if (!userId || !leaveType || !from || !to) {
      return callback(null, {
        message: MESSAGES.USERNAME_LEAVE_TYPE_FROM_TO_REQUIRED,
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

    // ── Tenant-settings enforcement ──────────────────────────────────────────
    const tenantId = getTenantId();
    if (tenantId) {
      const leaveSettings = await getLeaveSettings(tenantId);

      if (leaveSettings) {
        // 1. If custom leave types are configured, validate the requested type.
        if (leaveSettings.customLeaveTypes.length > 0) {
          const validKeys = leaveSettings.customLeaveTypes.flatMap((lt: any) =>
            [lt.key, lt.name].filter(Boolean),
          );
          // Always allow the three built-in types so tenants don't
          // accidentally lock themselves out while still migrating.
          validKeys.push(
            "PL",
            "SL",
            "CL",
            "Paid Leave",
            "Sick Leave",
            "Casual Leave",
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

    const days = calculateWorkingDays(startDay, endDay);
    const fromDate = startDay.toDate();
    const toDate = endDay.toDate();

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
      },
    });

    await cacheManager.invalidatePattern("leaves:*");

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
      data: leaveApplication,
    });
  } catch (err) {
    logger.error("ApplyLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
