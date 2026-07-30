import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import { tenantFrom, tenantReplyTo, renderEmailHtml } from "@hrms/common";
import { instantiateApproval } from "@hrms/approval-engine";
import { MESSAGES } from "../constants/messages";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";
import {
  findPolicy,
  ensureTrackedBalance,
  isCompOffLeaveType,
  getAvailableCompOffDays,
  type LeavePolicy,
} from "./leaveBalanceHelpers";
import { getLeaveSettings, DEFAULT_WORKING_DAYS } from "../utils/leaveSettings";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/** Set of "YYYY-MM-DD" company holiday dates falling within [from, to]. */
async function getHolidayDates(
  from: dayjs.Dayjs,
  to: dayjs.Dayjs,
): Promise<Set<string>> {
  const records = await (prisma as any).holiday.findMany({
    where: { year: { gte: from.year(), lte: to.year() } },
  });
  const dates = new Set<string>();
  for (const record of records) {
    const list = Array.isArray(record.holidays) ? record.holidays : [];
    for (const h of list) {
      if (h?.date) dates.add(h.date);
    }
  }
  return dates;
}

function calculateWorkingDays(
  from: dayjs.Dayjs,
  to: dayjs.Dayjs,
  workingDays: number[] = DEFAULT_WORKING_DAYS,
  holidayDates: Set<string> = new Set(),
): number {
  let count = 0;
  let cur = from.startOf("day");
  const end = to.startOf("day");
  while (!cur.isAfter(end)) {
    if (
      workingDays.includes(cur.day()) &&
      !holidayDates.has(cur.format("YYYY-MM-DD"))
    ) {
      count++;
    }
    cur = cur.add(1, "day");
  }
  return count;
}

export const applyLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, from, to, reason, sickLeave } = call.request;
    let leaveType: string = call.request.leaveType || "";
    const unit: string = call.request.unit || "full_day";
    const session: string | undefined = call.request.session || undefined;
    const shortLeaveHours: number | undefined =
      call.request.shortLeaveHours || undefined;

    if (!userId || !from || !to) {
      return callback(null, {
        message: MESSAGES.USERNAME_FROM_TO_REQUIRED,
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
    }

    // Default an omitted/blank leaveType to Paid Leave — falling back to
    // Leave Without Pay when the applicant's paid-leave balance is tracked
    // and already exhausted, so a defaulted application doesn't get rejected
    // below by the exhaustion check for a type the caller never chose.
    if (!leaveType) {
      leaveType = "PL";
      if (tenantId && leaveSettings) {
        const applicant = await prisma.user.findUnique({
          where: { id: userId },
          select: { joining_date: true },
        });
        const plRemaining = await ensureTrackedBalance(
          tenantId,
          userId,
          "PL",
          leaveSettings,
          applicant?.joining_date,
        );
        if (plRemaining !== null && plRemaining <= 0) {
          leaveType = "LWP";
        }
      }
    }

    if (tenantId && leaveSettings) {
      {
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

        // 2. Medical certificate required for sick leave (legacy scalar
        // setting) OR when the matched leavePolicies entry itself is flagged
        // requiresProof — a custom type (e.g. Maternity) may need proof
        // without ever setting the legacy `sickLeave` flag.
        const { medicalCertificate } = call.request;
        const matchedPolicy = findPolicy(
          leaveSettings.leavePolicies,
          leaveType,
        );
        const proofRequired =
          (sickLeave && leaveSettings.medicalCertRequired) ||
          matchedPolicy?.requiresProof;
        if (proofRequired && !medicalCertificate) {
          return callback(null, {
            message: matchedPolicy?.requiresProof
              ? `Proof/certificate is required for ${matchedPolicy.name || leaveType} in your organisation.`
              : "A medical certificate is required for sick leave in your organisation.",
            status: status.INVALID_ARGUMENT,
          });
        }

        // 3. Blackout periods — date ranges where this leave type can't be
        // taken at all (e.g. a year-end freeze).
        const blackoutPeriods = matchedPolicy?.blackoutPeriods as
          | { start: string; end: string; reason?: string }[]
          | undefined;
        if (blackoutPeriods?.length) {
          const blackout = blackoutPeriods.find((b) => {
            const bStart = dayjs.utc(b.start).startOf("day");
            const bEnd = dayjs.utc(b.end).startOf("day");
            return !startDay.isAfter(bEnd) && !endDay.isBefore(bStart);
          });
          if (blackout) {
            return callback(null, {
              message: `${matchedPolicy?.name || leaveType} cannot be taken between ${dayjs.utc(blackout.start).format("DD MMM YYYY")} and ${dayjs.utc(blackout.end).format("DD MMM YYYY")}${blackout.reason ? ` (${blackout.reason})` : ""}.`,
              status: status.INVALID_ARGUMENT,
            });
          }
        }

        // 4. Team concurrent cap — no more than X% of the applicant's team
        // may be on this leave type at the same time.
        const capPercent = matchedPolicy?.teamConcurrentCapPercent as
          | number
          | undefined;
        if (capPercent) {
          const team = await prisma.team.findFirst({
            where: { tenantId, members: { has: userId } },
            select: { members: true },
          });
          if (team && team.members.length > 0) {
            const teamLeaves = await prisma.leaveApplication.findMany({
              where: {
                userId: { in: team.members },
                leaveType,
                status: { in: ["Pending", "Approved"] },
              },
              select: { userId: true, from: true, to: true },
            });
            const concurrentUserIds = new Set(
              teamLeaves
                .filter((l) => {
                  const lStart = dayjs.utc(l.from);
                  const lEnd = dayjs.utc(l.to);
                  return !startDay.isAfter(lEnd) && !endDay.isBefore(lStart);
                })
                .map((l) => l.userId),
            );
            const projectedCount =
              concurrentUserIds.size + (concurrentUserIds.has(userId) ? 0 : 1);
            const projectedPercent =
              (projectedCount / team.members.length) * 100;
            if (projectedPercent > capPercent) {
              return callback(null, {
                message: `Approving this would put ${projectedCount}/${team.members.length} of your team on ${matchedPolicy?.name || leaveType} at once, above the ${capPercent}% cap.`,
                status: status.FAILED_PRECONDITION,
              });
            }
          }
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

    // Mirror the equivalent check wfh.ts's requestWfh already does for the
    // reverse direction — without this, WFH-then-leave (for the same day)
    // could get both independently approved with no punch either way.
    const existingWfh = await (prisma as any).wfhRequest.findFirst({
      where: {
        userId,
        status: { in: ["Pending", "Approved"] },
        date: { lte: endDay.toDate() },
        toDate: { gte: startDay.toDate() },
      },
    });
    if (existingWfh) {
      return callback(null, {
        message: MESSAGES.WFH_OVERLAPS_LEAVE_RANGE,
        status: status.ALREADY_EXISTS,
      });
    }

    let days: number;
    if (unit === "half_day") {
      days = 0.5;
    } else if (unit === "short_leave") {
      days = Math.round((shortLeaveHours! / 8) * 100) / 100;
    } else {
      const holidayDates = await getHolidayDates(startDay, endDay);
      days = calculateWorkingDays(
        startDay,
        endDay,
        leaveSettings?.workingDays,
        holidayDates,
      );
    }
    const fromDate = startDay.toDate();
    const toDate = endDay.toDate();

    // ── Exhaustion enforcement — opt-in and fail-open for genuinely
    // unconfigured leave types, but no longer for the common case: any type
    // with a resolvable quota (a matching leavePolicies.daysPerYear, or a
    // built-in PL/SL/CL scalar) gets its balance seeded on first use via
    // ensureTrackedBalance, so the tenant's configured quotas are always the
    // enforcement source once a quota exists — not just when a tenant has
    // separately opted into leavePolicies.onExhaustion.
    //   - onExhaustion="reject" (also the default when a quota resolves but
    //     no policy/onExhaustion was explicitly configured): blocks the
    //     application outright.
    //   - onExhaustion="auto_lop" / "manager_override": still allowed
    //     through, but the shortfall is surfaced to the approver via the
    //     approval-instance metadata + notification instead of vanishing
    //     silently — "manager_override" means the approver decides, which
    //     requires them to actually see it.
    let exhaustionInfo: {
      onExhaustion: string;
      remaining: number;
      shortfallDays: number;
    } | null = null;
    if (
      tenantId &&
      leaveSettings &&
      !isCompOffLeaveType(leaveType, leaveSettings.leavePolicies)
    ) {
      const policy = findPolicy(leaveSettings.leavePolicies, leaveType);
      const applicant = await prisma.user.findUnique({
        where: { id: userId },
        select: { joining_date: true },
      });
      const remaining = await ensureTrackedBalance(
        tenantId,
        userId,
        leaveType,
        leaveSettings,
        applicant?.joining_date,
      );
      if (remaining !== null && days > remaining) {
        const onExhaustion = policy?.onExhaustion ?? "reject";
        if (onExhaustion === "reject") {
          return callback(null, {
            message: `Insufficient ${policy?.name || leaveType} balance — ${remaining} day(s) remaining, ${days} requested.`,
            status: status.FAILED_PRECONDITION,
          });
        }
        exhaustionInfo = {
          onExhaustion,
          remaining,
          shortfallDays: Math.round((days - remaining) * 100) / 100,
        };
      }
    }

    // Comp-off draws down against earned CompOffCredit rows, a separate pool
    // from the generic balances JSON — checked here for early feedback; the
    // credits are actually consumed on approval (see approveLeave.ts).
    if (
      tenantId &&
      isCompOffLeaveType(leaveType, leaveSettings?.leavePolicies)
    ) {
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

    await cacheManager.invalidatePattern(`t:${tenantId ?? "global"}:leaves:*`);

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
          ...(exhaustionInfo ? { exhaustion: exhaustionInfo } : {}),
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
        select: { id: true, username: true, email: true },
      }),
      prisma.team.findMany({
        where: {
          OR: [{ members: { has: userId } }, { teamLeaderId: userId }],
        },
        select: { teamLeaderId: true },
      }),
      masterPrisma.tenant.findUnique({
        where: { id: getTenantId()! },
        select: { name: true, helpEmail: true },
      }),
    ])
      .then(async ([applicant, hrUsers, teams, tenant]) => {
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
                select: { id: true, username: true, email: true },
              })
            : [];
        const allTargets = [...hrUsers, ...teamLeaderUsers];
        const uniqueIds = [...new Set(allTargets.map((u) => u.id))];
        const uniqueUsernames = [...new Set(allTargets.map((u) => u.username))];
        if (uniqueUsernames.length === 0) return;
        const shortfallNote = exhaustionInfo
          ? ` — exceeds balance by ${exhaustionInfo.shortfallDays} day(s) (${exhaustionInfo.remaining} remaining); ${exhaustionInfo.onExhaustion === "manager_override" ? "approver must decide" : "will be treated as loss-of-pay"}.`
          : "";
        const message = `${applicantUsername} has applied for leave from ${fromStr} to ${toStr}${shortfallNote}`;
        const tenantName = tenant?.name ?? "your organisation";
        const uniqueEmails = [
          ...new Set(
            allTargets.map((u) => u.email).filter((e): e is string => !!e),
          ),
        ];

        await notify({
          tenantId: getTenantId()!,
          event: "leaveApplied",
          recipients: uniqueIds,
          pushTargets: uniqueUsernames,
          inApp: {
            title: "Leave",
            message,
            eventType: "leave_notification",
            priority: exhaustionInfo ? "high" : "medium",
            // Already surfaced in Pending Approvals via instantiateApproval
            // above — silent avoids duplicating it as a bell notification too.
            silent: true,
          },
          email:
            uniqueEmails.length > 0
              ? {
                  to: uniqueEmails,
                  subject: `Leave request from ${applicantUsername}`,
                  html: renderEmailHtml({
                    title: "Leave Request",
                    tenantName,
                    bodyHtml: `<h2>Hello,</h2><p>${message}</p>`,
                  }),
                  from: tenantFrom(tenantName),
                  replyTo: tenantReplyTo(tenant?.helpEmail),
                }
              : undefined,
        });
      })
      .catch((err) => logger.warn("[applyLeave] notify failed:", { err }));

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
