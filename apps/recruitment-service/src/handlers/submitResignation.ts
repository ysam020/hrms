import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { instantiateApproval } from "@hrms/approval-engine";
import { MESSAGES } from "../constants/messages";
import { resolveNoticePeriodDays } from "./noticePeriod";
import { toResignationProto } from "./resignationSerializer";
import dayjs from "dayjs";

export const submitResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      userId,
      resignationDate,
      lastDate,
      reason,
      overallJobSatisfaction,
      suggestions,
    } = call.request;
    const exitType: string = call.request.exitType || "voluntary";

    if (!userId || !resignationDate) {
      return callback(null, {
        message: MESSAGES.USERNAME_RESIGNATION_DATE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }
    if (
      !["voluntary", "termination", "absconding", "mutual"].includes(exitType)
    ) {
      return callback(null, {
        message: MESSAGES.INVALID_EXIT_TYPE,
        status: status.INVALID_ARGUMENT,
      });
    }

    const tenantId = getTenantId()!;

    // tenantId scoped — a user with memberships in multiple tenants must be
    // free to have an active resignation in one tenant while resigning
    // (separately) from another.
    const existing = await prisma.resignation.findFirst({
      where: { userId, tenantId, status: { in: ["Submitted", "Approved"] } },
    });
    if (existing) {
      return callback(null, {
        message: MESSAGES.ACTIVE_RESIGNATION_EXISTS,
        status: status.ALREADY_EXISTS,
      });
    }

    const resignedOn = dayjs(resignationDate).toDate();

    // Absconding has no notice period by definition; everything else resolves
    // via NoticePeriodPolicy (tenure/role/department bands), falling back to
    // the tenant's flat TenantSettings.noticePeriodDays when unconfigured.
    let noticePeriodDays = 0;
    let computedLastWorkingDay: Date | null = lastDate
      ? dayjs(lastDate).toDate()
      : null;
    if (exitType !== "absconding") {
      const employee = await prisma.user.findUnique({
        where: { id: userId },
        select: { joining_date: true, designation: true, department: true },
      });
      noticePeriodDays = await resolveNoticePeriodDays(tenantId, {
        joining_date: employee?.joining_date ?? null,
        designation: employee?.designation ?? null,
        department: employee?.department ?? null,
      });
      // Only default lastWorkingDay from the notice period when the employee
      // didn't explicitly propose one — their proposal is a request, not yet
      // a commitment either way (HR can still counter on approval).
      if (!computedLastWorkingDay) {
        computedLastWorkingDay = dayjs(resignedOn)
          .add(noticePeriodDays, "day")
          .toDate();
      }
    } else {
      computedLastWorkingDay = resignedOn;
    }

    const resignation = await prisma.resignation.create({
      data: {
        tenantId,
        userId,
        resignationDate: resignedOn,
        lastWorkingDay: computedLastWorkingDay,
        reason: reason || null,
        overallJobSatisfaction: overallJobSatisfaction
          ? parseFloat(String(overallJobSatisfaction))
          : 0,
        suggestions: suggestions || null,
        status: "Submitted",
        submittedOn: new Date(),
        exitType,
        noticePeriodDays,
      },
    });

    await cacheManager.invalidatePattern(`t:${tenantId}:resignations:*`);

    // Routes the approve/reject decision through the tenant's configured
    // Approval Chain (zero-config default: requester's reporting manager,
    // falling back to an owner/admin) — api-gateway's actOnApprovalForEntity
    // resolves this instance and drives approveResignation/rejectResignation
    // once acted on.
    await instantiateApproval(tenantId, "resignation", resignation.id, userId, {
      exitType,
    });

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
        await getNotificationQueue().add("resignationSubmitted", {
          title: "Resignation",
          message: `${applicantUsername} has submitted resignation form`,
          recipients: uniqueIds,
          pushTargets: uniqueUsernames,
          eventType: "resignation_notification",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.error("[submitResignation] Notification enqueue failed:", {
          err,
        }),
      );

    return callback(null, {
      message: MESSAGES.RESIGNATION_SUBMITTED,
      status: status.OK,
      data: toResignationProto(resignation),
    });
  } catch (err) {
    logger.error("SubmitResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
