import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import dayjs from "dayjs";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import {
  tenantFrom,
  tenantReplyTo,
  renderEmailHtml,
  deriveFromComponents,
} from "@hrms/common";
import { MESSAGES } from "../constants/messages";

// Interview date/time is stored as a "YYYYMMDDTHHmmss" string (see
// ScheduleInterviewModal.tsx). Returns null for missing/unparseable input.
function parseInterviewTime(value: unknown): dayjs.Dayjs | null {
  if (!value || typeof value !== "string") return null;
  const parsed = dayjs(value, "YYYYMMDDTHHmmss");
  return parsed.isValid() ? parsed : null;
}

export const updateApplicationStatus = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    // The proto field is `status` — this local is renamed to avoid shadowing
    // the imported grpc-js `status` enum used for response codes below.
    const {
      id,
      status: applicationStatus,
      remarks,
      salary,
      joiningDate,
      referenceBy,
      interviewRound,
      interviewFeedback,
      components,
    } = call.request;

    if (!id || !applicationStatus) {
      return callback(null, {
        message: MESSAGES.APPLICATION_ID_STATUS_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const application = await prisma.jobApplication.findUnique({
      where: { id },
    });
    if (!application) {
      return callback(null, {
        message: MESSAGES.APPLICATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // Hired/Rejected are terminal — covers re-hiring, re-rejecting, and
    // round Completed/Cleared updates arriving after the fact (e.g. a
    // stale UI tab) all in one place, since hireCandidate, rejectApplication,
    // and round-status updates all funnel through this single RPC.
    if (application.status === "Hired" || application.status === "Rejected") {
      return callback(null, {
        message: `This candidate has already been ${application.status} — no further status changes are allowed.`,
        status: status.FAILED_PRECONDITION,
      });
    }

    // A candidate can only be hired once at least one round has actually
    // been conducted AND formally Cleared — `cleared` is set below when a
    // round is Cleared, independent of the top-level `status` string, which
    // stops reflecting an earlier round's outcome as soon as a later round
    // is scheduled.
    if (applicationStatus === "Hired") {
      const existingInterviews = Array.isArray(application.interviews)
        ? (application.interviews as any[])
        : [];
      const hasClearedLegacyRound = existingInterviews.some(
        (i: any) => i.interviewConducted === true && i.cleared === true,
      );
      // A candidate progressed entirely through the newer pipeline-template
      // flow (advanceApplicationStage/applicationStages.ts) never gets an
      // entry written to the legacy `interviews` field — that flow tracks
      // everything through ApplicationStageEvent instead. Without also
      // checking there, this gate is wired only to a field those tenants
      // never populate, and no candidate on the new pipeline could ever be
      // hired.
      const hasClearedPipelineStage =
        !hasClearedLegacyRound &&
        (await (prisma as any).applicationStageEvent.findFirst({
          where: { applicationId: id, outcome: "pass" },
        })) !== null;
      if (!hasClearedLegacyRound && !hasClearedPipelineStage) {
        return callback(null, {
          message:
            "This candidate cannot be hired until at least one interview round has been Completed and Cleared.",
          status: status.FAILED_PRECONDITION,
        });
      }
    }

    const updateData: Record<string, any> = { status: applicationStatus };
    if (remarks) updateData.remarks = remarks;
    if (applicationStatus === "Hired") {
      if (Array.isArray(components) && components.length > 0) {
        // Real component breakdown captured at hire time — hireSalary is
        // derived from it (a correct monthly gross) rather than typed
        // independently, so the two can never disagree.
        const { grossEarnings } = deriveFromComponents(components);
        updateData.hireSalary = grossEarnings;
        updateData.hireSalaryComponents = components;
      } else if (salary) {
        updateData.hireSalary = parseFloat(salary);
      }
      if (joiningDate) updateData.hireJoiningDate = new Date(joiningDate);
      if (referenceBy) updateData.hireReferredBy = referenceBy;
    }

    // Mark the specific round conducted (e.g. "Round 2 Cleared") — addressed
    // by roundNumber, not array position, since rounds are upserted in place
    // by scheduleInterview/rescheduleInterview.
    const isCompleting = applicationStatus.includes("Completed");
    const isClearing = applicationStatus.includes("Cleared");
    if (interviewRound && (isCompleting || isClearing)) {
      const interviews = Array.isArray(application.interviews)
        ? (application.interviews as any[])
        : [];
      const idx = interviews.findIndex(
        (i: any) => i.roundNumber === interviewRound,
      );
      if (idx >= 0) {
        const alreadyConducted = interviews[idx].interviewConducted === true;

        // A round can only move Scheduled → Completed → Cleared, in that
        // order. Re-marking an already-Completed round Completed again (or
        // Clearing one that was never Completed) would silently accept a
        // no-op that skips the actual interview, so both are rejected.
        if (isCompleting && alreadyConducted) {
          return callback(null, {
            message: `Round ${interviewRound} has already been marked Completed. Mark it Cleared instead.`,
            status: status.FAILED_PRECONDITION,
          });
        }
        if (isClearing && !alreadyConducted) {
          return callback(null, {
            message: `Round ${interviewRound} must be marked Completed before it can be Cleared.`,
            status: status.FAILED_PRECONDITION,
          });
        }

        if (isCompleting) {
          // A round can't be marked Completed before it has actually
          // happened — reject the whole status change rather than silently
          // updating the status string without flipping interviewConducted.
          const scheduledEnd = parseInterviewTime(
            interviews[idx].interviewEndTime,
          );
          if (scheduledEnd && dayjs().isBefore(scheduledEnd)) {
            return callback(null, {
              message: `Round ${interviewRound} is scheduled until ${scheduledEnd.format("DD MMM YYYY, HH:mm")} and cannot be marked Completed before then.`,
              status: status.FAILED_PRECONDITION,
            });
          }
          // Feedback is captured once, at Completion — the frontend already
          // requires it here, this is the authoritative check. Clearing is
          // a pure follow-up decision on an already-conducted round, so it
          // neither re-collects nor overwrites this feedback.
          if (!interviewFeedback || !String(interviewFeedback).trim()) {
            return callback(null, {
              message: `Interview feedback is required to mark Round ${interviewRound} as Completed.`,
              status: status.INVALID_ARGUMENT,
            });
          }
          interviews[idx] = {
            ...interviews[idx],
            interviewConducted: true,
            feedback: interviewFeedback,
          };
          updateData.interviews = interviews;
        } else if (isClearing) {
          // Tracked per round (not just inferred from the top-level status
          // string) so the Hiring guard above still sees this round as
          // Cleared even after a later round starts and moves `status` on.
          interviews[idx] = { ...interviews[idx], cleared: true };
          updateData.interviews = interviews;
        }
      }
    }

    const updatedApplication = await prisma.jobApplication.update({
      where: { id },
      data: updateData,
    });

    // If hired, increment candidatesHired on the job opening
    if (applicationStatus === "Hired" && application.jobTitleId) {
      await prisma.jobOpening.update({
        where: { id: application.jobTitleId },
        data: { candidatesHired: { increment: 1 } },
      });
    }

    const tenantId = getTenantId();
    await cacheManager.invalidatePattern(`t:${tenantId}:applications:*`);
    // Hiring also changes job openings counts
    if (applicationStatus === "Hired")
      await cacheManager.invalidatePattern(`t:${tenantId}:jobOpenings:*`);

    // Notify HR (in-app) and the candidate (email) — two different
    // audiences for the same underlying status-change event, fire-and-forget.
    Promise.all([
      prisma.user.findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      }),
      masterPrisma.tenant.findUnique({
        where: { id: tenantId! },
        select: { name: true, helpEmail: true },
      }),
    ])
      .then(([hrUsers, tenant]) => {
        const tenantName = tenant?.name ?? "the hiring team";
        return notify({
          tenantId: tenantId!,
          event: "applicationStatusUpdated",
          recipients: hrUsers.map((u) => u.id),
          pushTargets: hrUsers.map((u) => u.username),
          inApp:
            hrUsers.length > 0
              ? {
                  title: "Recruitment",
                  message: `Interview status updated: ${updatedApplication.name} - ${applicationStatus}`,
                  eventType: "interview_status_update",
                  priority: "medium",
                }
              : undefined,
          email: updatedApplication.email
            ? {
                to: updatedApplication.email,
                subject: `Your application status has been updated — ${tenantName}`,
                html: renderEmailHtml({
                  title: "Application Status Update",
                  tenantName,
                  bodyHtml: `<h2>Hello ${updatedApplication.name ?? "there"},</h2>
<p>There's an update on your application with <strong>${tenantName}</strong>.</p>
<p><strong>Status:</strong> ${applicationStatus}</p>`,
                }),
                from: tenantFrom(tenantName),
                replyTo: tenantReplyTo(tenant?.helpEmail),
              }
            : undefined,
        });
      })
      .catch((err) =>
        logger.error("[updateApplicationStatus] notify failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.APPLICATION_STATUS_UPDATED,
      status: status.OK,
      data: {
        id: updatedApplication.id,
        jobTitleId: updatedApplication.jobTitleId || "",
        name: updatedApplication.name || "",
        email: updatedApplication.email || "",
        mobile: updatedApplication.mobile || "",
        resume: updatedApplication.resume || "",
        status: updatedApplication.status || "",
        appliedAt: "",
        resumeScore: updatedApplication.resumeScore ?? 0,
        aiNotes: updatedApplication.aiNotes || "",
      },
    });
  } catch (err) {
    logger.error("UpdateApplicationStatus error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
