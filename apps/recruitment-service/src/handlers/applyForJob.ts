import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getResumeParsingQueue } from "@hrms/queue";
import { notify } from "@hrms/notifications";
import { MESSAGES } from "../constants/messages";

export const applyForJob = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    // aadharNo is still on the wire for old callers but is never stored or
    // used to identify anyone — candidates are matched in matchCandidate().
    const {
      jobTitleId,
      name,
      email: rawEmail,
      mobile,
      resume,
      reason,
      profileJson,
      screeningAnswersJson,
      coverLetter,
      emailVerified,
      consentAt,
      privacyNoticeVersion,
    } = call.request;
    const email = String(rawEmail || "")
      .trim()
      .toLowerCase();

    if (!jobTitleId || !name || !email) {
      return callback(null, {
        message: MESSAGES.JOB_TITLE_ID_NAME_EMAIL_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    // getTenantId() is populated by resolvePublicTenant (api-gateway) from
    // the careers-link slug — guard instead of asserting non-null, since a
    // missing context would otherwise silently write the literal string
    // "undefined" into tenantId below.
    const tenantId = getTenantId();
    if (!tenantId) {
      return callback(null, {
        message: MESSAGES.TENANT_REQUIRED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const jobOpening = await prisma.jobOpening.findUnique({
      where: { id: jobTitleId },
    });
    // "Apply by" a date means through the end of that day (stored as its
    // midnight), so the opening closes a full day after the stored instant.
    const pastDeadline =
      !!jobOpening?.applicationDeadline &&
      jobOpening.applicationDeadline.getTime() + 24 * 60 * 60 * 1000 <=
        Date.now();
    if (
      !jobOpening ||
      !["Open", "Active"].includes(jobOpening.status) ||
      pastDeadline
    ) {
      return callback(null, {
        message: MESSAGES.JOB_NOT_FOUND_OR_CLOSED,
        status: status.NOT_FOUND,
      });
    }

    // Case-insensitive so applications stored before emails were normalised
    // still count as "already applied".
    const existing = await prisma.jobApplication.findFirst({
      where: { jobTitleId, email: { equals: email, mode: "insensitive" } },
    });
    if (existing) {
      return callback(null, {
        message: MESSAGES.ALREADY_APPLIED,
        status: status.ALREADY_EXISTS,
      });
    }

    // Snapshot the pipeline template in effect right now — jobOpening's own
    // configured template, else the tenant's default one, else none (the
    // legacy free-form `interviews` flow). Snapshotting (not just following
    // jobOpening.pipelineTemplateId live) means editing/deleting a template
    // later doesn't retroactively change what stage an in-flight candidate
    // is already partway through.
    let pipelineTemplateId = jobOpening.pipelineTemplateId ?? null;
    if (!pipelineTemplateId) {
      const defaultTemplate = await prisma.interviewPipelineTemplate.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
      });
      pipelineTemplateId = defaultTemplate?.id ?? null;
    }

    const profile = parseJson(profileJson) ?? null;
    const screeningAnswers = parseJson(screeningAnswersJson) ?? null;
    const { candidateId, possibleDuplicateOfCandidateId } =
      await matchCandidate({
        tenantId,
        name,
        email,
        mobile: mobile || null,
        emailVerified: emailVerified === true,
        profile: profile ?? {},
      });

    const application = await prisma.jobApplication.create({
      data: {
        tenantId,
        jobTitleId,
        name,
        email,
        mobile: mobile || null,
        resume: resume || null,
        reason: reason || null,
        status: "Applied",
        pipelineTemplateId,
        currentStageOrder: 0,
        candidateId,
        possibleDuplicateOfCandidateId,
        profile,
        screeningAnswers,
        coverLetter: coverLetter || null,
        submittedAt: new Date(),
        consentAt: consentAt ? new Date(consentAt) : null,
        privacyNoticeVersion: privacyNoticeVersion || null,
      },
    });

    await cacheManager.invalidatePattern(`t:${tenantId}:applications:*`);

    // Enqueue resume scoring (fire-and-forget — worker updates DB asynchronously)
    getResumeParsingQueue()
      .add("scoreResume", { applicationId: application.id })
      .catch((err) =>
        logger.warn("[applyForJob] Resume parsing enqueue failed:", { err }),
      );

    // Notify HR + hiring manager (fire-and-forget)
    prisma.user
      .findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      })
      .then(async (hrUsers) => {
        const allTargets = [...hrUsers];
        if (jobOpening.hiringManager) {
          const hmUser = await prisma.user.findFirst({
            where: {
              OR: [
                { username: jobOpening.hiringManager },
                {
                  AND: [
                    { first_name: { not: null } },
                    { last_name: { not: null } },
                  ],
                },
              ],
            },
            select: {
              id: true,
              username: true,
              first_name: true,
              last_name: true,
            },
          });
          if (hmUser && !allTargets.find((u) => u.id === hmUser.id))
            allTargets.push(hmUser);
        }
        if (allTargets.length === 0) return;
        return notify({
          tenantId,
          event: "jobApplicationReceived",
          recipients: allTargets.map((u) => u.id),
          pushTargets: allTargets.map((u) => u.username),
          inApp: {
            title: "Recruitment",
            message: `New job application: ${name} has applied for ${jobOpening.jobTitle}`,
            eventType: "job_application",
            priority: "medium",
          },
        });
      })
      .catch((err) =>
        logger.error("[applyForJob] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.APPLICATION_SUBMITTED,
      status: status.OK,
      data: {
        id: application.id,
        jobTitleId: application.jobTitleId,
        name: application.name,
        email: application.email,
        mobile: application.mobile ?? "",
        status: application.status,
        resumeScore: application.resumeScore ?? 0,
        aiNotes: application.aiNotes ?? "",
        candidateId: application.candidateId ?? "",
      },
    });
  } catch (err) {
    logger.error("ApplyForJob error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};

const parseJson = (v: unknown) => {
  if (typeof v !== "string" || !v) return undefined;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const numOrNull = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * Finds or creates the Candidate for an application. An earlier candidate is
 * reused only when this applicant proved they own the email (one-time code)
 * and that earlier record's email was verified the same way — an email or
 * mobile number someone merely typed can be mistyped, shared or someone
 * else's, so it never merges two people. Such a match is instead recorded as
 * possibleDuplicateOfCandidateId for HR to look at. Aadhaar plays no part.
 */
export async function matchCandidate(input: {
  tenantId: string;
  name: string;
  email: string;
  mobile: string | null;
  emailVerified: boolean;
  profile: Record<string, unknown>;
}): Promise<{
  candidateId: string;
  possibleDuplicateOfCandidateId: string | null;
}> {
  const { tenantId, name, email, mobile, emailVerified, profile } = input;
  const details = {
    name,
    mobile,
    currentLocation: str(profile.currentLocation),
    linkedinUrl: str(profile.linkedinUrl),
    portfolioUrl: str(profile.portfolioUrl),
    githubUrl: str(profile.githubUrl),
    skills: str(profile.skills),
    totalExperience: numOrNull(profile.totalExperience),
    highestQualification: str(profile.highestQualification),
  };

  if (emailVerified) {
    const verified = await prisma.candidate.findFirst({
      where: { email, emailVerifiedAt: { not: null } },
      orderBy: { updatedAt: "desc" },
    });
    if (verified) {
      // Same verified person: keep their profile current, but never blank
      // out something they told us before with an empty answer now.
      const updates = Object.fromEntries(
        Object.entries(details).filter(([, v]) => v !== null && v !== ""),
      );
      await prisma.candidate.update({
        where: { id: verified.id },
        data: updates,
      });
      return { candidateId: verified.id, possibleDuplicateOfCandidateId: null };
    }
  }

  const lookalike = await prisma.candidate.findFirst({
    where: {
      OR: [{ email }, ...(mobile ? [{ mobile }] : [])],
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const created = await prisma.candidate.create({
    data: {
      tenantId,
      email,
      emailVerifiedAt: emailVerified ? new Date() : null,
      ...details,
    },
  });
  return {
    candidateId: created.id,
    possibleDuplicateOfCandidateId: lookalike?.id ?? null,
  };
}
