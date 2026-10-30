import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import {
  RESPONSE_STATUS,
  grpcToHttpStatus,
  renderEmailHtml,
  sendEmail,
  tenantFrom,
} from "@hrms/common";
import { recruitmentClient, grpcCall } from "../grpc/clients";
import { s3Client, S3_BUCKET, S3_URL_PREFIX, s3FileUrl } from "../config/s3";
import {
  PRIVACY_NOTICE_VERSION,
  normalizeEmail,
  normalizeMobile,
  readJobConfig,
  sanitizeApplicationData,
  snapshotAnswers,
  validateApplication,
  visibleProfile,
  type ApplicationData,
} from "./recruitmentForms";

// Public application drafts. A draft is created once the candidate has given
// their name, email and mobile (never just for opening the page) and is
// reachable only with a bearer token handed to the device that created or
// recovered it — knowing a draft id is not enough. Another device gets a
// token by proving it can read the draft's email (a 6-digit, 10-minute,
// single-use code). Tokens and codes are stored only as SHA-256 hashes.

const DRAFT_TTL_MS = 30 * 24 * 3600_000;
const CODE_TTL_MS = 10 * 60_000;
const CODE_RESEND_MS = 60_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_TOKENS = 5;
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export type Result = { httpStatus: number; body: Record<string, unknown> };
const fail = (httpStatus: number, message: string, extra = {}): Result => ({
  httpStatus,
  body: { message, ...extra },
});

/** The résumé must be one this tenant's careers page uploaded. */
export const isOwnResume = (url: string) =>
  url.startsWith(s3FileUrl(`job_applications/${getTenantId()}/`));

/** Presigned PUTs can't cap size, so the stored object is checked before an
 * application is accepted: it must exist, be a PDF and be at most 5 MB. */
async function checkResumeObject(url: string): Promise<string | null> {
  try {
    const key = decodeURIComponent(url.slice(S3_URL_PREFIX.length));
    const head = await s3Client.send(
      new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }),
    );
    if ((head.ContentLength ?? 0) > MAX_RESUME_BYTES)
      return "Attach a PDF smaller than 5 MB.";
    if (head.ContentType && head.ContentType !== "application/pdf")
      return "Attach a PDF.";
    return null;
  } catch {
    return "Your résumé didn't finish uploading. Attach it again.";
  }
}

// ── Submission ──────────────────────────────────────────────────────────────

/**
 * Validates a complete application against the opening's stored form and
 * hands it to the recruitment service, which creates the candidate and
 * application and runs the usual notifications / résumé scoring. `job` is
 * the proto JobOpening, already checked to be open to the public.
 */
export async function submitApplication(
  job: any,
  raw: unknown,
  opts: { emailVerified: boolean },
): Promise<Result> {
  const { form, questions } = readJobConfig(job);
  const data = sanitizeApplicationData(raw, questions);
  const errors = validateApplication(data, form, questions, isOwnResume);
  if (!errors.resume && data.resume) {
    const resumeError = await checkResumeObject(data.resume);
    if (resumeError) errors.resume = resumeError;
  }
  if (Object.keys(errors).length)
    return fail(RESPONSE_STATUS.BAD_REQUEST, "Some answers need attention.", {
      errors,
    });

  const response: any = await grpcCall(recruitmentClient, "applyForJob", {
    jobTitleId: job.id,
    name: data.name,
    email: normalizeEmail(data.email),
    mobile: normalizeMobile(data.mobile) ?? "",
    resume: data.resume,
    profileJson: JSON.stringify(visibleProfile(data, form)),
    screeningAnswersJson: JSON.stringify(snapshotAnswers(data, questions)),
    coverLetter: form.coverLetter === "hidden" ? "" : data.coverLetter,
    emailVerified: opts.emailVerified,
    consentAt: new Date().toISOString(),
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
  });
  return {
    httpStatus: grpcToHttpStatus(response?.status),
    body: {
      message: response?.message,
      // Only the id goes back to the anonymous caller, not the stored record.
      data: response?.data?.id ? { id: response.data.id } : undefined,
    },
  };
}

// ── Drafts ──────────────────────────────────────────────────────────────────

type Draft = NonNullable<
  Awaited<ReturnType<typeof prisma.applicationDraft.findUnique>>
>;

function view(draft: Draft, questions: any[]) {
  return {
    draftId: draft.id,
    revision: draft.revision,
    updatedAt: draft.updatedAt,
    emailVerified: !!draft.emailVerifiedAt,
    status: draft.status,
    applicationId: draft.applicationId,
    // Re-sanitised on the way out too, so answers to questions removed since
    // the draft was saved never reach the form.
    data: sanitizeApplicationData(draft.data, questions),
  };
}

/** Loads a draft for the bearer of `token`, scoped to this tenant (the DB
 * client is per-tenant) and to `jobId` when given. Returns null for a wrong
 * token exactly as for a missing draft, so ids can't be probed. */
export async function authorizeDraft(
  draftId: string,
  token: string | undefined,
): Promise<Draft | null> {
  if (!/^[a-f0-9]{24}$/.test(draftId) || !token || token.length > 200)
    return null;
  const draft = await prisma.applicationDraft.findUnique({
    where: { id: draftId },
  });
  if (!draft || draft.status === "discarded") return null;
  if (draft.expiresAt.getTime() < Date.now() && draft.status !== "submitted")
    return null;
  const hash = sha256(token);
  return draft.tokenHashes.some((h) => sameHash(h, hash)) ? draft : null;
}

async function loadOpenJob(jobId: string, isOpen: (j: any) => boolean) {
  if (!/^[a-f0-9]{24}$/.test(jobId)) return null;
  const res: any = await grpcCall(recruitmentClient, "getJobOpening", {
    id: jobId,
  });
  return isOpen(res?.data) ? res.data : null;
}

/** Same job + email already has a submitted application (any case). */
const alreadyApplied = (jobId: string, email: string) =>
  prisma.jobApplication.findFirst({
    where: { jobTitleId: jobId, email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });

export async function createDraft(
  jobId: string,
  raw: unknown,
  isOpen: (j: any) => boolean,
): Promise<Result> {
  const job = await loadOpenJob(jobId, isOpen);
  if (!job)
    return fail(
      RESPONSE_STATUS.NOT_FOUND,
      "This job opening is no longer accepting applications.",
    );
  const { questions } = readJobConfig(job);
  const data = sanitizeApplicationData(raw, questions);
  // Enough to identify the draft later — anything less isn't saved.
  const errors = validateApplication(
    data,
    { fields: {}, resume: "optional", coverLetter: "hidden" },
    [],
    () => true,
  );
  const needed = (["name", "email", "mobile"] as const).filter(
    (k) => errors[k],
  );
  if (needed.length)
    return fail(RESPONSE_STATUS.BAD_REQUEST, "Some answers need attention.", {
      errors: Object.fromEntries(needed.map((k) => [k, errors[k]])),
    });

  const email = normalizeEmail(data.email);
  if (await alreadyApplied(jobId, email))
    return fail(
      RESPONSE_STATUS.CONFLICT,
      "You've already applied for this role with this email.",
      { code: "ALREADY_APPLIED" },
    );
  const existing = await prisma.applicationDraft.findFirst({
    where: {
      jobOpeningId: jobId,
      email,
      status: { in: ["draft", "submitting"] },
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (existing)
    // Don't hand someone else's saved answers to whoever types the email:
    // they must prove they can read it first (see sendRecoveryCode).
    return fail(
      RESPONSE_STATUS.CONFLICT,
      "There's a saved application for this email. We can email you a code to continue it.",
      { code: "DRAFT_EXISTS" },
    );

  const token = newToken();
  const draft = await prisma.applicationDraft.create({
    data: {
      tenantId: getTenantId()!,
      jobOpeningId: jobId,
      email,
      data: data as any,
      tokenHashes: [sha256(token)],
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
    },
  });
  return {
    httpStatus: RESPONSE_STATUS.CREATED,
    body: {
      message: "Draft saved",
      data: { ...view(draft, questions), token },
    },
  };
}

export async function getDraft(draft: Draft, isOpen: (j: any) => boolean) {
  const job = await loadOpenJob(draft.jobOpeningId, isOpen);
  const { questions } = readJobConfig(job ?? {});
  return {
    httpStatus: RESPONSE_STATUS.SUCCESS,
    body: { data: { ...view(draft, questions), jobOpen: !!job } },
  };
}

/** Saves the whole form state if `revision` is still current; otherwise
 * refuses with the newer server copy so the client can resolve it. */
export async function saveDraft(
  draft: Draft,
  revision: unknown,
  raw: unknown,
  isOpen: (j: any) => boolean,
): Promise<Result> {
  if (draft.status !== "draft")
    return fail(
      RESPONSE_STATUS.CONFLICT,
      "This application was already sent.",
      {
        code: "SUBMITTED",
      },
    );
  const job = await loadOpenJob(draft.jobOpeningId, isOpen);
  if (!job)
    return fail(
      RESPONSE_STATUS.NOT_FOUND,
      "This job opening is no longer accepting applications.",
    );
  const { questions } = readJobConfig(job);
  if (typeof revision !== "number" || revision !== draft.revision)
    return fail(
      RESPONSE_STATUS.CONFLICT,
      "This application was changed on another device.",
      { code: "STALE", data: view(draft, questions) },
    );
  const data = sanitizeApplicationData(raw, questions);
  const email = normalizeEmail(data.email);
  const emailChanged = !!email && email !== draft.email;
  // Conditional on the revision so two saves racing each other can't both win.
  const { count } = await prisma.applicationDraft.updateMany({
    where: { id: draft.id, revision: draft.revision, status: "draft" },
    data: {
      data: data as any,
      revision: { increment: 1 },
      expiresAt: new Date(Date.now() + DRAFT_TTL_MS),
      ...(emailChanged && { email, emailVerifiedAt: null }),
    },
  });
  const fresh = await prisma.applicationDraft.findUnique({
    where: { id: draft.id },
  });
  if (!count || !fresh)
    return fail(
      RESPONSE_STATUS.CONFLICT,
      "This application was changed on another device.",
      { code: "STALE", data: fresh ? view(fresh, questions) : undefined },
    );
  return {
    httpStatus: RESPONSE_STATUS.SUCCESS,
    body: { message: "Saved", data: view(fresh, questions) },
  };
}

export async function discardDraft(draft: Draft): Promise<Result> {
  if (draft.status === "draft")
    await prisma.applicationDraft.update({
      where: { id: draft.id },
      data: { status: "discarded", tokenHashes: [], data: {} },
    });
  return {
    httpStatus: RESPONSE_STATUS.SUCCESS,
    body: { message: "Discarded" },
  };
}

/**
 * Turns a draft into an application. Idempotent: a retried or double-clicked
 * submit returns the application the first one created. The draft is claimed
 * ("submitting") with a conditional update first, so concurrent submits
 * can't both reach the recruitment service.
 */
export async function submitDraft(
  draft: Draft,
  isOpen: (j: any) => boolean,
): Promise<Result> {
  if (draft.status === "submitted" && draft.applicationId)
    return {
      httpStatus: RESPONSE_STATUS.SUCCESS,
      body: {
        message: "Application submitted",
        data: { id: draft.applicationId, alreadySubmitted: true },
      },
    };
  const job = await loadOpenJob(draft.jobOpeningId, isOpen);
  if (!job)
    return fail(
      RESPONSE_STATUS.NOT_FOUND,
      "This job opening is no longer accepting applications.",
    );
  const claimed = await prisma.applicationDraft.updateMany({
    where: { id: draft.id, status: "draft" },
    data: { status: "submitting" },
  });
  if (!claimed.count)
    return fail(
      RESPONSE_STATUS.CONFLICT,
      "Your application is already being sent.",
      { code: "IN_PROGRESS" },
    );

  let result: Result;
  try {
    result = await submitApplication(job, draft.data, {
      // Only a code-verified draft whose email wasn't changed afterwards.
      emailVerified:
        !!draft.emailVerifiedAt &&
        normalizeEmail((draft.data as any)?.email) === draft.email,
    });
  } catch (err) {
    await prisma.applicationDraft.update({
      where: { id: draft.id },
      data: { status: "draft" },
    });
    throw err;
  }
  const id = (result.body.data as any)?.id;
  if (result.httpStatus === RESPONSE_STATUS.SUCCESS && id) {
    // Keep the row (and its token) so a retry is answered from here, but
    // drop the answers — the application now holds them.
    await prisma.applicationDraft.update({
      where: { id: draft.id },
      data: {
        status: "submitted",
        applicationId: id,
        data: {},
        recoveryCodeHash: null,
      },
    });
  } else {
    await prisma.applicationDraft.update({
      where: { id: draft.id },
      data: { status: "draft" },
    });
  }
  return result;
}

// ── Cross-device recovery ───────────────────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

const GENERIC_SENT =
  "If there's a saved application for that email, we've sent it a code.";

/** Emails a one-time code for the draft saved under this job + email. The
 * reply is the same whether or not one exists, so it can't be used to learn
 * who has applied. */
export async function sendRecoveryCode(
  jobId: string,
  rawEmail: unknown,
  isOpen: (j: any) => boolean,
): Promise<Result> {
  const email = normalizeEmail(rawEmail);
  const ok = {
    httpStatus: RESPONSE_STATUS.SUCCESS,
    body: { message: GENERIC_SENT },
  };
  if (!email || !/^[a-f0-9]{24}$/.test(jobId)) return ok;
  const draft = await prisma.applicationDraft.findFirst({
    where: {
      jobOpeningId: jobId,
      email,
      status: "draft",
      expiresAt: { gt: new Date() },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (!draft) return ok;
  if (
    draft.recoveryCodeSentAt &&
    Date.now() - draft.recoveryCodeSentAt.getTime() < CODE_RESEND_MS
  )
    return ok;
  const job = await loadOpenJob(jobId, isOpen);
  if (!job) return ok;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.applicationDraft.update({
    where: { id: draft.id },
    data: {
      recoveryCodeHash: sha256(`${draft.id}:${code}`),
      recoveryCodeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      recoveryCodeSentAt: new Date(),
      recoveryAttempts: 0,
    },
  });
  const tenant = await masterPrisma.tenant.findUnique({
    where: { id: getTenantId()! },
    select: { name: true },
  });
  const org = tenant?.name || "the hiring team";
  sendEmail({
    to: email,
    from: tenantFrom(org),
    subject: `Your code to continue your application`,
    html: renderEmailHtml({
      title: "Continue your application",
      tenantName: tenant?.name,
      preheader: `Your code is ${code}`,
      bodyHtml: `<p>Use this code to continue your application for <strong>${escapeHtml(job.jobTitle || "the role")}</strong>:</p><p style="font-size:28px;font-weight:600;letter-spacing:6px;">${code}</p><p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    }),
  }).catch((error) =>
    // The address is deliberately not logged.
    logger.warn("draft recovery email failed", { error, draftId: draft.id }),
  );
  return ok;
}

/** Exchanges a valid code for a token for this device. The code is single
 * use and dies after five wrong guesses. */
export async function verifyRecoveryCode(
  jobId: string,
  rawEmail: unknown,
  rawCode: unknown,
  isOpen: (j: any) => boolean,
): Promise<Result> {
  const invalid = fail(
    RESPONSE_STATUS.BAD_REQUEST,
    "That code isn't right or has expired. Ask for a new one.",
  );
  const email = normalizeEmail(rawEmail);
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!email || !/^\d{6}$/.test(code) || !/^[a-f0-9]{24}$/.test(jobId))
    return invalid;
  const draft = await prisma.applicationDraft.findFirst({
    where: {
      jobOpeningId: jobId,
      email,
      status: "draft",
      recoveryCodeHash: { not: null },
    },
    orderBy: { updatedAt: "desc" },
  });
  if (
    !draft?.recoveryCodeHash ||
    !draft.recoveryCodeExpiresAt ||
    draft.recoveryCodeExpiresAt.getTime() < Date.now() ||
    draft.recoveryAttempts >= MAX_CODE_ATTEMPTS
  )
    return invalid;
  if (!sameHash(draft.recoveryCodeHash, sha256(`${draft.id}:${code}`))) {
    const attempts = draft.recoveryAttempts + 1;
    await prisma.applicationDraft.update({
      where: { id: draft.id },
      data:
        attempts >= MAX_CODE_ATTEMPTS
          ? { recoveryAttempts: attempts, recoveryCodeHash: null }
          : { recoveryAttempts: attempts },
    });
    return invalid;
  }
  const token = newToken();
  const updated = await prisma.applicationDraft.update({
    where: { id: draft.id },
    data: {
      tokenHashes: [...draft.tokenHashes, sha256(token)].slice(-MAX_TOKENS),
      emailVerifiedAt: new Date(),
      recoveryCodeHash: null,
      recoveryCodeExpiresAt: null,
      recoveryAttempts: 0,
    },
  });
  const job = await loadOpenJob(jobId, isOpen);
  const { questions } = readJobConfig(job ?? {});
  return {
    httpStatus: RESPONSE_STATUS.SUCCESS,
    body: { message: "Verified", data: { ...view(updated, questions), token } },
  };
}

export type { ApplicationData };
