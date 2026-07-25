import { Response } from "express";
import {
  prisma,
  Prisma,
  getClientForDb,
  canonicalizeEmail,
  getEmailDomain,
  isPublicEmailDomain,
  runWithTenant,
  recordAuditEntry,
  AuditActor,
} from "@hrms/db";
import { randomBytes, createHmac } from "crypto";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../middleware/authenticate";
import {
  apiResponse,
  RESPONSE_STATUS,
  sendEmail,
  tenantFrom,
  PLATFORM_FROM,
  renderEmailHtml,
  hasPrivilegedRole,
} from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { aesEncrypt } from "@hrms/crypto";
import { fetchPaymentMethod, getRazorpay } from "./payment";
import { notify } from "@hrms/notifications";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days — matches REFRESH_TOKEN_EXPIRE default
  path: "/api/v1/refresh-token",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function issueTokenPair(
  userId: string,
  tenantId: string,
  tenantRole: string,
  dbName: string | null,
  orgSetupComplete: boolean = true,
) {
  const accessToken = jwt.sign(
    {
      userId,
      tenantId,
      tenantRole,
      pendingSetup: false,
      orgSetupComplete,
      dbName,
    },
    process.env.ACCESS_JWT_TOKEN!,
    {
      algorithm: "HS256",
      expiresIn: (process.env.ACCESS_JWT_EXPIRE || "24h") as any,
    },
  );
  const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN!, {
    algorithm: "HS256",
    expiresIn: (process.env.REFRESH_TOKEN_EXPIRE || "30d") as any,
  });
  return { accessToken, refreshToken };
}

// Razorpay subscription payment signature: HMAC(paymentId|subscriptionId)
function verifySubscriptionSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
): boolean {
  const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${paymentId}|${subscriptionId}`)
    .digest("hex");
  return expected === signature;
}

// Shared by the idempotency check at the top of buildTenant and by the
// unique-constraint-conflict fallback below: if a tenant already exists for
// this subscription and the caller already has a membership on it, re-issue
// tokens and respond instead of erroring. Returns true if it handled the
// response (caller should return immediately), false if there's nothing to
// resume (caller should proceed with tenant creation, or rethrow).
async function tryReissueTokensForSubscription(
  razorpaySubscriptionId: string,
  userId: string,
  res: Response,
): Promise<boolean> {
  const existingTenant = await prisma.tenant.findFirst({
    where: { razorpaySubscriptionId },
  });
  if (!existingTenant) return false;

  const existingMembership = await prisma.tenantMembership.findFirst({
    where: { tenantId: existingTenant.id, userId },
  });
  if (!existingMembership) return false;

  const { accessToken, refreshToken } = issueTokenPair(
    userId,
    existingTenant.id,
    existingMembership.role,
    existingTenant.dbName ?? null,
    false,
  );
  const { storeRefreshToken } = await import("../services/tenantTokenStore");
  await storeRefreshToken(
    userId,
    refreshToken,
    existingTenant.id,
    existingMembership.role,
    undefined,
    existingTenant.dbName ?? null,
    false,
  );
  res.cookie("refresh_token", aesEncrypt(refreshToken), REFRESH_COOKIE_OPTIONS);
  apiResponse(res, RESPONSE_STATUS.SUCCESS, {
    data: {
      accessToken,
      tenant: {
        id: existingTenant.id,
        name: existingTenant.name,
        slug: existingTenant.slug,
      },
    },
    message: "Organisation setup resumed.",
  });
  return true;
}

// Shared tenant provisioning — called after payment is verified (either via
// client-side signature in createTenant or Razorpay API in completePendingSetup).
async function buildTenant(
  userId: string,
  params: {
    name: string;
    industry?: string;
    companySize?: string;
    billing?: string;
    razorpaySubscriptionId: string;
    razorpayPaymentId?: string;
    workWeekPattern?: {
      type: "mon_fri" | "mon_sat" | "custom";
      workingDays: number[];
    };
  },
  res: Response,
  req: AuthRequest,
) {
  const {
    name,
    industry,
    companySize,
    billing,
    razorpaySubscriptionId,
    razorpayPaymentId,
    workWeekPattern,
  } = params;

  // Idempotency: if a tenant was already created for this subscription (e.g.
  // the client retries after a tab-close mid-request), re-issue tokens.
  if (
    await tryReissueTokensForSubscription(razorpaySubscriptionId, userId, res)
  ) {
    return;
  }

  let slug = slugify(name);
  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${randomBytes(3).toString("hex")}`;
  const dbName = `hrms-${slug}`;

  // Derive a domain for auto-join suggestions — public/free-mail domains are
  // never claimed. A domain already claimed by another *active* tenant
  // blocks creation outright (see below) rather than silently creating a
  // second, domain-less org for it — the frontend already steers matching
  // signups into the join-request flow (checkDomainSuggestion), so reaching
  // here with a claimed domain means that guard was bypassed or lost a race.
  let domain: string | null = null;
  const creator = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, username: true },
  });
  if (creator?.email) {
    const candidateDomain = getEmailDomain(canonicalizeEmail(creator.email));
    if (candidateDomain && !isPublicEmailDomain(candidateDomain)) {
      const claimedBy = await prisma.tenant.findFirst({
        where: { domain: candidateDomain, isActive: true },
      });
      if (claimedBy) {
        // Payment was already captured by Razorpay before this endpoint
        // runs (client-side checkout for createTenant, or a verified
        // subscription for completePendingSetup) — best-effort cancel it
        // rather than silently charging for a tenant we're refusing to
        // create. Future cycles are stopped; the already-captured payment
        // may still need a manual refund.
        await (getRazorpay().subscriptions.cancel as any)(
          razorpaySubscriptionId,
          { cancel_at_cycle_end: 0 },
        ).catch((error: unknown) =>
          logger.error(
            "[buildTenant] Failed to cancel subscription for rejected duplicate-domain signup:",
            { error, razorpaySubscriptionId },
          ),
        );
        return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
          message: `${claimedBy.name} already has a workspace for your email domain. Request to join that organisation instead.`,
          code: "DOMAIN_ALREADY_CLAIMED",
        });
      }
      domain = candidateDomain;
    }
  }

  const now = new Date();
  const planExpiresAt = new Date(now);
  if (billing === "annual") {
    planExpiresAt.setFullYear(planExpiresAt.getFullYear() + 1);
  } else {
    planExpiresAt.setMonth(planExpiresAt.getMonth() + 1);
  }

  const pmInfo = razorpayPaymentId
    ? await fetchPaymentMethod(razorpayPaymentId)
    : null;

  let tenant;
  try {
    tenant = await prisma.tenant.create({
      data: {
        name: name.trim(),
        slug,
        dbName,
        plan: "pro",
        ...(billing && { billing }),
        ...(industry && { industry }),
        ...(companySize && { companySize }),
        razorpaySubscriptionId,
        subscriptionStatus: "active",
        planActivatedAt: now,
        planExpiresAt,
        ...(domain && { domain }),
        ...(pmInfo && {
          paymentMethod: pmInfo.method,
          paymentMethodSummary: pmInfo.summary,
        }),
      },
    });
  } catch (error: unknown) {
    // A concurrent request for the same subscription won the race — the
    // partial unique index on razorpaySubscriptionId (ensureIndexes.ts)
    // rejected this insert. Fall back to the idempotent re-issue path
    // instead of failing the request outright.
    const isDuplicateSubscription =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002";
    if (
      isDuplicateSubscription &&
      (await tryReissueTokensForSubscription(
        razorpaySubscriptionId,
        userId,
        res,
      ))
    ) {
      return;
    }
    throw error;
  }

  // Attribute audit rows written during provisioning (tenantSettings.create,
  // the User/TenantMembership writes below) to the tenant + user creating
  // it — there's no authenticate() middleware run for this request (the JWT
  // is a pendingSetup token with no tenantId yet) to populate this context.
  const actor: AuditActor = {
    userId,
    username: creator?.username ?? null,
    ipAddress: req.ip || req.socket.remoteAddress || "",
    userAgent: req.headers["user-agent"] || "",
  };

  // Force Atlas to materialise the tenant database, then seed default settings.
  // Awaited (not fire-and-forget) so a client that immediately hits a
  // tenant-scoped endpoint after this response can't land before seeding
  // finishes. Failures are still only logged, not thrown — a seeding hiccup
  // must not block the response, it just means TenantSettings backfills lazily.
  const tenantClient = getClientForDb(dbName);
  await runWithTenant(
    tenant.id,
    tenantClient,
    async () => {
      try {
        const initDoc = {
          tenantId: tenant.id,
          initializedAt: new Date(),
        };
        await (tenantClient.$runCommandRaw as any)({
          insert: "_init",
          documents: [{ _id: { $oid: tenant.id }, ...initDoc }],
        });
        // $runCommandRaw bypasses attachAuditLogging (no Prisma model/action
        // for the middleware to key off), so record it manually.
        recordAuditEntry(tenantClient as any, "_init", "create", null, initDoc);
        // Seed the initial TenantSettings version so services always have a DB record.
        // workWeekPattern defaults to Mon-Fri if the signup step was skipped —
        // never blocks tenant creation.
        await (tenantClient as any).tenantSettings.create({
          data: {
            tenantId: tenant.id,
            effectiveFrom: now,
            createdBy: userId,
            note: "Initial defaults",
            workWeekPattern: workWeekPattern ?? {
              type: "mon_fri",
              workingDays: [1, 2, 3, 4, 5],
            },
            // Maternity Leave is a statutory entitlement in India (Maternity
            // Benefit Act, 26 weeks) — seeded so it shows up as a real,
            // editable policy in Settings rather than only existing as a bare
            // dropdown option. Paternity is a common accompanying default.
            leavePolicies: [
              {
                key: "MATERNITY",
                name: "Maternity Leave",
                daysPerYear: 182,
                isStatutory: true,
                requiresProof: true,
                onExhaustion: "manager_override",
              },
              {
                key: "PATERNITY",
                name: "Paternity Leave",
                daysPerYear: 15,
                isStatutory: false,
                requiresProof: false,
                onExhaustion: "manager_override",
              },
            ],
          },
        });
      } catch (error: unknown) {
        logger.warn("[buildTenant] Failed to seed TenantSettings:", { error });
      }
    },
    actor,
  );

  await runWithTenant(
    tenant.id,
    tenantClient,
    () =>
      Promise.all([
        prisma.user.update({
          where: { id: userId },
          data: { tenantId: tenant.id, isSuperUser: true },
        }),
        prisma.tenantMembership.create({
          data: { tenantId: tenant.id, userId, role: "owner" },
        }),
      ]),
    actor,
  );

  const { accessToken, refreshToken } = issueTokenPair(
    userId,
    tenant.id,
    "owner",
    tenant.dbName ?? null,
    false,
  );
  const { storeRefreshToken } = await import("../services/tenantTokenStore");
  await storeRefreshToken(
    userId,
    refreshToken,
    tenant.id,
    "owner",
    undefined,
    tenant.dbName ?? null,
    false,
  );
  res.cookie("refresh_token", aesEncrypt(refreshToken), REFRESH_COOKIE_OPTIONS);

  // Platform-branded welcome — Praesto welcoming a new customer, not tenant
  // HR (no tenant HR identity exists at this point anyway).
  if (creator?.email) {
    notify({
      tenantId: tenant.id,
      event: "tenantWelcome",
      email: {
        to: creator.email,
        subject: `Welcome to Praesto, ${tenant.name}!`,
        html: renderEmailHtml({
          title: "Welcome to Praesto",
          tenantName: tenant.name,
          // Praesto welcoming a new customer, not tenant HR — keep the
          // platform signature even though the tenant name is still shown
          // in the header for context.
          signature: "Praesto Team",
          bodyHtml: `<h2>Welcome, ${creator.username ?? "there"}!</h2><p>Your organisation <strong>${tenant.name}</strong> is now set up on Praesto. You can log in and start inviting your team.</p>`,
        }),
        from: PLATFORM_FROM,
      },
    }).catch((error: unknown) =>
      logger.warn("[buildTenant] welcome notify failed:", { error }),
    );
  }

  return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
    data: {
      accessToken,
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    },
    message: "Organisation created successfully.",
  });
}

// POST /api/v1/tenants — create a new organisation (client-side signature verification)
export async function createTenant(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
  try {
    const {
      name,
      industry,
      companySize,
      billing,
      razorpayPaymentId,
      razorpaySubscriptionId,
      razorpaySignature,
      workWeekPattern,
    } = req.body as {
      name?: string;
      industry?: string;
      companySize?: string;
      billing?: string;
      razorpayPaymentId?: string;
      razorpaySubscriptionId?: string;
      razorpaySignature?: string;
      workWeekPattern?: {
        type: "mon_fri" | "mon_sat" | "custom";
        workingDays: number[];
      };
    };

    if (!name?.trim()) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Organisation name is required.",
      });
    }
    if (!razorpayPaymentId || !razorpaySubscriptionId || !razorpaySignature) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Payment details are required.",
      });
    }
    if (
      !verifySubscriptionSignature(
        razorpayPaymentId,
        razorpaySubscriptionId,
        razorpaySignature,
      )
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Payment verification failed.",
      });
    }

    return buildTenant(
      userId,
      {
        name,
        industry,
        companySize,
        billing,
        razorpaySubscriptionId,
        razorpayPaymentId,
        workWeekPattern,
      },
      res,
      req,
    );
  } catch (error: unknown) {
    logger.error("createTenant error:", { error });
    return handleError(res, error);
  }
}

// POST /api/v1/tenants/complete-pending-setup — server-side recovery path
// Verifies payment directly with Razorpay API (no client-side signature needed).
export async function completePendingSetup(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
  try {
    const { name, industry, companySize, workWeekPattern } = req.body as {
      name?: string;
      industry?: string;
      companySize?: string;
      workWeekPattern?: {
        type: "mon_fri" | "mon_sat" | "custom";
        workingDays: number[];
      };
    };
    if (!name?.trim()) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Organisation name is required.",
      });
    }

    const { getPendingSubscription, clearPendingSubscription } =
      await import("../services/tenantTokenStore");
    const pending = await getPendingSubscription(userId);
    if (!pending) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "No pending payment found.",
      });
    }

    const rzp = getRazorpay();
    const subscription = await (rzp.subscriptions.fetch as any)(
      pending.subscriptionId,
    );
    if (!["authenticated", "active"].includes(subscription.status)) {
      await clearPendingSubscription(userId);
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Payment not completed.",
      });
    }

    // Fetch the payment ID for payment-method info (best-effort).
    const paymentsRes = await (rzp.payments as any).all({
      subscription_id: pending.subscriptionId,
      count: 10,
    });
    const verifiedPayment = paymentsRes.items?.find(
      (p: any) => p.status === "captured" || p.status === "authorized",
    );

    await buildTenant(
      userId,
      {
        name,
        industry,
        companySize,
        billing: pending.billing,
        razorpaySubscriptionId: pending.subscriptionId,
        razorpayPaymentId: verifiedPayment?.id,
        workWeekPattern,
      },
      res,
      req,
    );

    // Fire-and-forget cleanup — response already sent by buildTenant.
    clearPendingSubscription(userId).catch((error) =>
      logger.warn("clearPendingSubscription failed:", { error }),
    );
  } catch (error: unknown) {
    logger.error("completePendingSetup error:", { error });
    return handleError(res, error);
  }
}

// POST /api/v1/tenants/select — select a tenant from the picker
export async function selectTenant(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
  try {
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "tenantId is required.",
      });
    }

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId },
    });
    if (!membership) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You are not a member of this organisation.",
      });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant?.isActive) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "This organisation is inactive.",
      });
    }

    // Stamp tenantId if not set
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });
    if (!user?.tenantId) {
      await prisma.user.update({ where: { id: userId }, data: { tenantId } });
    }

    const { accessToken, refreshToken } = issueTokenPair(
      userId,
      tenantId,
      membership.role,
      tenant.dbName ?? null,
    );

    const { storeRefreshToken } = await import("../services/tenantTokenStore");
    await storeRefreshToken(
      userId,
      refreshToken,
      tenantId,
      membership.role,
      undefined,
      tenant.dbName ?? null,
      true,
    );

    res.cookie(
      "refresh_token",
      aesEncrypt(refreshToken),
      REFRESH_COOKIE_OPTIONS,
    );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        accessToken,
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        tenantRole: membership.role,
      },
      message: "Tenant selected.",
    });
  } catch (error: unknown) {
    logger.error("selectTenant error:", { error });
    return handleError(res, error);
  }
}

// GET /api/v1/tenants/available — list all tenants the current user is a member of
export async function listAvailableTenants(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
  try {
    const memberships = await prisma.tenantMembership.findMany({
      where: { userId },
    });
    if (memberships.length === 0) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: { tenants: [] },
      });
    }
    const tenantIds = memberships.map((m) => m.tenantId);
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds }, isActive: true },
      select: { id: true, name: true, slug: true },
    });
    const result = memberships
      .map((m) => {
        const t = tenants.find((t) => t.id === m.tenantId);
        return t ? { ...t, role: m.role } : null;
      })
      .filter(Boolean);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { tenants: result },
    });
  } catch (error: unknown) {
    logger.error("listAvailableTenants error:", { error });
    return handleError(res, error);
  }
}

// GET /api/v1/tenants/me — get current tenant info
export async function getMyTenant(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
      message: "No active tenant.",
    });
  }
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Tenant not found.",
      });
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: { tenant } });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

// GET /api/v1/tenants/members — list members of the current tenant
export async function listTenantMembers(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  try {
    const memberships = await prisma.tenantMembership.findMany({
      where: { tenantId },
    });
    const userIds = memberships.map((m) => m.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        first_name: true,
        last_name: true,
        employee_photo: true,
      },
    });

    const members = memberships.map((m) => {
      const u = users.find((u) => u.id === m.userId);
      return {
        userId: m.userId,
        role: m.role,
        joinedAt: m.joinedAt,
        email: u?.email ?? "",
        firstName: u?.first_name ?? "",
        lastName: u?.last_name ?? "",
        photo: u?.employee_photo ?? "",
      };
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: { members } });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

// GET /api/v1/tenants/org-profile — all authenticated members can view
export async function getOrgProfile(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
      message: "No active tenant.",
    });
  }
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        name: true,
        helpPhone: true,
        helpEmail: true,
        officeAddress: true,
        tan: true,
        website: true,
        workState: true,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { orgProfile: tenant },
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

// PUT /api/v1/tenants/org-profile — superuser or "Company Info:" permission only
export async function updateOrgProfile(req: AuthRequest, res: Response) {
  const { userId, tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  const actor = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true, permissions: true },
  });
  const canEdit =
    actor?.isSuperUser ||
    (actor?.permissions ?? []).includes("Organisation:edit_company_info");
  if (!canEdit) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to update the organisation profile.",
    });
  }
  try {
    const { helpPhone, helpEmail, officeAddress, tan, website, workState } =
      req.body as {
        helpPhone?: string;
        helpEmail?: string;
        officeAddress?: string;
        tan?: string;
        website?: string;
        workState?: string;
      };
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(helpPhone !== undefined && { helpPhone: helpPhone || null }),
        ...(helpEmail !== undefined && { helpEmail: helpEmail || null }),
        ...(officeAddress !== undefined && {
          officeAddress: officeAddress || null,
        }),
        ...(tan !== undefined && { tan: tan || null }),
        ...(website !== undefined && { website: website || null }),
        ...(workState !== undefined && { workState: workState || null }),
      },
      select: {
        name: true,
        helpPhone: true,
        helpEmail: true,
        officeAddress: true,
        tan: true,
        website: true,
        workState: true,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { orgProfile: tenant },
      message: "Organisation profile updated.",
    });
  } catch (error: unknown) {
    return handleError(res, error);
  }
}

// POST /api/v1/tenants/complete-org-setup — mark org profile step done, get new token
export async function completeOrgSetup(req: AuthRequest, res: Response) {
  const { userId, tenantId, tenantRole, dbName } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  try {
    const { markOrgSetupComplete } =
      await import("../services/tenantTokenStore");
    await markOrgSetupComplete(userId);

    const accessToken = jwt.sign(
      {
        userId,
        tenantId,
        tenantRole,
        pendingSetup: false,
        orgSetupComplete: true,
        dbName,
      },
      process.env.ACCESS_JWT_TOKEN!,
      {
        algorithm: "HS256",
        expiresIn: (process.env.ACCESS_JWT_EXPIRE || "24h") as any,
      },
    );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: { accessToken } });
  } catch (error: unknown) {
    logger.error("completeOrgSetup error:", { error });
    return handleError(res, error);
  }
}

// ─── Domain-matched join requests ──────────────────────────────────────────────

// GET /api/v1/tenants/domain-suggestion — checked by pendingSetup users on the
// org-setup page: is there an existing org matching my email domain, or do I
// already have a join request in flight?
export async function checkDomainSuggestion(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const domain = user?.email
      ? getEmailDomain(canonicalizeEmail(user.email))
      : "";

    const myRequest = await prisma.tenantJoinRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (myRequest?.status === "pending" || myRequest?.status === "approved") {
      const tenant = await prisma.tenant.findUnique({
        where: { id: myRequest.tenantId },
        select: { id: true, name: true },
      });
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: {
          requestStatus: myRequest.status,
          request: tenant
            ? {
                id: myRequest.id,
                tenantId: tenant.id,
                tenantName: tenant.name,
                createdAt: myRequest.createdAt,
              }
            : null,
          suggestion: null,
          previousRequestStatus: null,
        },
      });
    }

    if (!domain || isPublicEmailDomain(domain)) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: {
          requestStatus: null,
          request: null,
          suggestion: null,
          previousRequestStatus: null,
        },
      });
    }

    const match = await prisma.tenant.findFirst({
      where: { domain, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        requestStatus: null,
        request: null,
        suggestion: match
          ? { tenantId: match.id, tenantName: match.name, domain }
          : null,
        previousRequestStatus:
          myRequest?.status === "rejected" ? "rejected" : null,
      },
    });
  } catch (error: unknown) {
    logger.error("checkDomainSuggestion error:", { error });
    return handleError(res, error);
  }
}

// POST /api/v1/tenants/join-requests — request to join a domain-matched tenant
export async function createJoinRequest(req: AuthRequest, res: Response) {
  const { userId } = req.user!;
  try {
    const { tenantId } = req.body as { tenantId?: string };
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "tenantId is required.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const email = user?.email ? canonicalizeEmail(user.email) : "";
    const domain = email ? getEmailDomain(email) : "";

    if (!domain || isPublicEmailDomain(domain)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Domain-based join requests aren't available for this email address.",
      });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Organisation not found.",
      });
    }
    if (tenant.domain !== domain) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message:
          "You can only request to join an organisation that matches your email domain.",
      });
    }
    if (!tenant.isActive) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "This organisation is not currently active.",
      });
    }

    const alreadyMember = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId },
    });
    if (alreadyMember) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "You're already a member of this organisation.",
      });
    }

    await prisma.tenantJoinRequest.upsert({
      where: { tenantId_userId: { tenantId, userId } },
      create: { tenantId, userId, email, domain, status: "pending" },
      update: {
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        createdAt: new Date(),
      },
    });

    // Fire-and-forget notification to the target tenant's owners/admins and
    // anyone else holding the Organisation:approve_join_requests permission.
    void (async () => {
      try {
        const [admins, permissionHolders] = await Promise.all([
          prisma.tenantMembership.findMany({
            where: { tenantId, role: { in: ["owner", "admin"] } },
            select: { userId: true },
          }),
          prisma.user.findMany({
            where: {
              tenantId,
              permissions: { has: "Organisation:approve_join_requests" },
            },
            select: { id: true },
          }),
        ]);
        const recipientIds = [
          ...new Set([
            ...admins.map((a) => a.userId),
            ...permissionHolders.map((u) => u.id),
          ]),
        ];
        const recipientUsers = await prisma.user.findMany({
          where: { id: { in: recipientIds } },
          select: { id: true, email: true },
        });

        await Promise.all(
          recipientUsers
            .filter((u) => u.email)
            .map((u) =>
              sendEmail({
                to: u.email!,
                subject: `New request to join ${tenant.name}`,
                html: renderEmailHtml({
                  title: "New Join Request",
                  tenantName: tenant.name,
                  bodyHtml: `<h2>New join request</h2><p>${email} has requested to join <strong>${tenant.name}</strong> on Praesto.</p><p>Review it under Settings &gt; Join Requests.</p>`,
                }),
                from: tenantFrom(tenant.name),
              }).catch((e) =>
                logger.warn("join-request notification email failed", {
                  error: e,
                }),
              ),
            ),
        );

        if (recipientIds.length > 0) {
          notify({
            tenantId,
            event: "joinRequestSubmitted",
            recipients: recipientIds,
            inApp: {
              title: "Join request",
              message: `${email} requested to join ${tenant.name}`,
              eventType: "join_request_notification",
              priority: "medium",
              // Already surfaced in Pending Approvals via
              // getPendingJoinRequestItems — silent avoids duplicating it as
              // a bell notification too (the email above already alerts).
              silent: true,
            },
            push: { enabled: false },
          }).catch((e) =>
            logger.warn("join-request notify failed:", { error: e }),
          );
        }
      } catch (error: unknown) {
        logger.warn("join-request notification lookup failed", { error });
      }
    })();

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { status: "pending" },
      message:
        "Your request to join has been sent to the organisation's admins.",
    });
  } catch (error: unknown) {
    logger.error("createJoinRequest error:", { error });
    return handleError(res, error);
  }
}

// Mirrors canManageKyc in employee.ts: tenantRole owner/admin always pass;
// anyone else needs isSuperUser or the explicit
// Organisation:approve_join_requests permission (req.user from the JWT
// doesn't carry either, hence the lookup).
async function canApproveJoinRequests(req: AuthRequest): Promise<boolean> {
  const { userId, tenantRole } = req.user!;
  if (hasPrivilegedRole(tenantRole ?? "")) return true;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true, permissions: true },
  });
  if (user?.isSuperUser) return true;
  const permissions = (user?.permissions as string[]) ?? [];
  return permissions.includes("Organisation:approve_join_requests");
}

// GET /api/v1/tenants/join-requests — list pending join requests for the caller's tenant
export async function listJoinRequests(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  if (!(await canApproveJoinRequests(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to view join requests.",
    });
  }
  try {
    const status = (req.query.status as string) || "pending";
    const requests = await prisma.tenantJoinRequest.findMany({
      where: { tenantId, status },
      orderBy: { createdAt: "desc" },
    });
    const users = await prisma.user.findMany({
      where: { id: { in: requests.map((r) => r.userId) } },
      select: { id: true, first_name: true, last_name: true, email: true },
    });
    const result = requests.map((r) => {
      const u = users.find((u) => u.id === r.userId);
      return {
        id: r.id,
        userId: r.userId,
        name: u ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() : "",
        email: r.email,
        status: r.status,
        createdAt: r.createdAt,
      };
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { requests: result },
    });
  } catch (error: unknown) {
    logger.error("listJoinRequests error:", { error });
    return handleError(res, error);
  }
}

// POST /api/v1/tenants/join-requests/:id/approve
export async function approveJoinRequest(req: AuthRequest, res: Response) {
  const { userId, tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  if (!(await canApproveJoinRequests(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to approve join requests.",
    });
  }
  try {
    const id = String(req.params.id);
    const request = await prisma.tenantJoinRequest.findUnique({
      where: { id },
    });
    if (!request || request.tenantId !== tenantId) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Join request not found.",
      });
    }
    if (request.status !== "pending") {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "This request has already been resolved.",
      });
    }

    const existingMembership = await prisma.tenantMembership.findFirst({
      where: { tenantId, userId: request.userId },
    });
    if (!existingMembership) {
      await prisma.tenantMembership.create({
        data: {
          tenantId,
          userId: request.userId,
          role: "employee",
          invitedBy: userId,
        },
      });
    }

    await prisma.tenantJoinRequest.update({
      where: { id },
      data: { status: "approved", reviewedBy: userId, reviewedAt: new Date() },
    });

    void (async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      if (request.email) {
        sendEmail({
          to: request.email,
          subject: `Your request to join ${tenant?.name ?? "the organisation"} was approved`,
          html: renderEmailHtml({
            title: "Request Approved",
            tenantName: tenant?.name,
            bodyHtml: `<h2>You're in!</h2><p>You've been added to <strong>${tenant?.name ?? "the organisation"}</strong>. Sign in to get started.</p>`,
          }),
          from: tenantFrom(tenant?.name ?? "Praesto"),
        }).catch((e) =>
          logger.warn("join-request approval email failed", { error: e }),
        );
      }
    })();

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { requestId: id, status: "approved" },
      message: "Request approved.",
    });
  } catch (error: unknown) {
    logger.error("approveJoinRequest error:", { error });
    return handleError(res, error);
  }
}

// POST /api/v1/tenants/join-requests/:id/reject
export async function rejectJoinRequest(req: AuthRequest, res: Response) {
  const { userId, tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  if (!(await canApproveJoinRequests(req))) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to reject join requests.",
    });
  }
  try {
    const id = String(req.params.id);
    const { reason } = req.body as { reason?: string };
    const request = await prisma.tenantJoinRequest.findUnique({
      where: { id },
    });
    if (!request || request.tenantId !== tenantId) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Join request not found.",
      });
    }
    if (request.status !== "pending") {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "This request has already been resolved.",
      });
    }

    await prisma.tenantJoinRequest.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedBy: userId,
        reviewedAt: new Date(),
        rejectionReason: reason ?? null,
      },
    });

    void (async () => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      if (request.email) {
        sendEmail({
          to: request.email,
          subject: `Your request to join ${tenant?.name ?? "the organisation"} was declined`,
          html: renderEmailHtml({
            title: "Request Declined",
            tenantName: tenant?.name,
            bodyHtml: `<h2>Request declined</h2><p>Your request to join <strong>${tenant?.name ?? "the organisation"}</strong> was declined.</p>`,
          }),
          from: tenantFrom(tenant?.name ?? "Praesto"),
        }).catch((e) =>
          logger.warn("join-request rejection email failed", { error: e }),
        );
      }
    })();

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { requestId: id, status: "rejected" },
      message: "Request rejected.",
    });
  } catch (error: unknown) {
    logger.error("rejectJoinRequest error:", { error });
    return handleError(res, error);
  }
}

// GET /api/v1/tenants/join-requests/pending — feeds the sidebar/dashboard
// "Pending Approvals" surfaces, mirroring listPendingKycActions in
// employee.ts (same response shape, same "empty list rather than 403 for
// non-holders" semantics since this is merged into a shared widget).
// Shared by the standalone GET /tenants/join-requests/pending endpoint and
// the aggregated GET /approvals/pending-all endpoint (pendingActions.ts) —
// pure data fetch, no response writing, so it's safe to call from either.
export async function getPendingJoinRequestItems(
  req: AuthRequest,
): Promise<any[]> {
  const { tenantId } = req.user!;
  if (!tenantId) return [];
  if (!(await canApproveJoinRequests(req))) return [];

  const requests = await prisma.tenantJoinRequest.findMany({
    where: { tenantId, status: "pending" },
    orderBy: { createdAt: "desc" },
  });
  return requests.map((r) => ({
    instanceId: `join_request:${r.id}`,
    module: "join_request",
    requestedByName: r.email,
    createdAt: r.createdAt,
    summary: `${r.email} requested to join your organisation`,
  }));
}

export async function listPendingJoinRequestActions(
  req: AuthRequest,
  res: Response,
) {
  try {
    const data = await getPendingJoinRequestItems(req);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data });
  } catch (error: unknown) {
    logger.error("listPendingJoinRequestActions error:", { error });
    return handleError(res, error);
  }
}
