import { Request, Response } from "express";
import { prisma, getClientForDb } from "@hrms/db";
import { randomBytes, createHmac } from "crypto";
import jwt from "jsonwebtoken";
import { AuthRequest } from "../middleware/authenticate";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { aesEncrypt } from "@hrms/crypto";
import { fetchPaymentMethod } from "./payment";

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
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
      expiresIn: (process.env.ACCESS_JWT_EXPIRE || "1h") as any,
    },
  );
  const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN!, {
    algorithm: "HS256",
    expiresIn: (process.env.REFRESH_TOKEN_EXPIRE || "7d") as any,
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

// POST /api/v1/tenants — create a new organisation
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
    } = req.body as {
      name?: string;
      industry?: string;
      companySize?: string;
      billing?: string;
      razorpayPaymentId?: string;
      razorpaySubscriptionId?: string;
      razorpaySignature?: string;
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

    // Idempotency: if a tenant was already created for this subscription (e.g.
    // the client retries after a tab-close mid-request), re-issue tokens for
    // the existing tenant instead of creating a duplicate.
    const existingTenant = await prisma.tenant.findFirst({
      where: { razorpaySubscriptionId },
    });
    if (existingTenant) {
      const existingMembership = await prisma.tenantMembership.findFirst({
        where: { tenantId: existingTenant.id, userId },
      });
      if (existingMembership) {
        const { accessToken, refreshToken } = issueTokenPair(
          userId,
          existingTenant.id,
          existingMembership.role,
          existingTenant.dbName ?? null,
          false,
        );
        const { storeRefreshToken } =
          await import("../services/tenantTokenStore");
        await storeRefreshToken(
          userId,
          refreshToken,
          existingTenant.id,
          existingMembership.role,
          existingTenant.dbName ?? null,
          false,
        );
        res.cookie(
          "refresh_token",
          aesEncrypt(refreshToken),
          REFRESH_COOKIE_OPTIONS,
        );
        return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
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
      }
    }

    let slug = slugify(name);
    // Make slug unique by appending a suffix if needed
    const existing = await prisma.tenant.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${randomBytes(3).toString("hex")}`;
    }
    const dbName = `hrms-${slug}`;

    const now = new Date();
    const planExpiresAt = new Date(now);
    if (billing === "annual") {
      planExpiresAt.setFullYear(planExpiresAt.getFullYear() + 1);
    } else {
      planExpiresAt.setMonth(planExpiresAt.getMonth() + 1);
    }

    const pmInfo = await fetchPaymentMethod(razorpayPaymentId);

    const [tenant] = await Promise.all([
      prisma.tenant.create({
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
          ...(pmInfo && {
            paymentMethod: pmInfo.method,
            paymentMethodSummary: pmInfo.summary,
          }),
        },
      }),
    ]);

    // Fire-and-forget: force Atlas to materialise the tenant database.
    // We don't await — a slow Atlas cold-start must not block the response.
    const tenantClient = getClientForDb(dbName);
    (tenantClient.$runCommandRaw as any)({
      insert: "_init",
      documents: [
        {
          _id: { $oid: tenant.id },
          tenantId: tenant.id,
          initializedAt: new Date(),
        },
      ],
    }).catch(() => {});

    // Stamp tenantId on user, mark as superuser, create membership
    await Promise.all([
      prisma.user.update({
        where: { id: userId },
        data: { tenantId: tenant.id, isSuperUser: true },
      }),
      prisma.tenantMembership.create({
        data: { tenantId: tenant.id, userId, role: "owner" },
      }),
    ]);

    const { accessToken, refreshToken } = issueTokenPair(
      userId,
      tenant.id,
      "owner",
      tenant.dbName ?? null,
      false,
    );

    // Store refresh token in Redis and DB (fire and forget — same pattern as auth service)
    const { storeRefreshToken } = await import("../services/tenantTokenStore");
    await storeRefreshToken(
      userId,
      refreshToken,
      tenant.id,
      "owner",
      tenant.dbName ?? null,
      false,
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
      },
      message: "Organisation created successfully.",
    });
  } catch (err) {
    logger.error("createTenant error:", { err });
    return handleError(res, err);
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
  } catch (err) {
    logger.error("selectTenant error:", { err });
    return handleError(res, err);
  }
}

// POST /api/v1/tenants/invite — invite someone by email (requires tenantId + owner/admin role)
export async function inviteUser(req: AuthRequest, res: Response) {
  const { userId, tenantId, tenantRole } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  if (!["owner", "admin"].includes(tenantRole ?? "")) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can invite users.",
    });
  }

  try {
    const { email, role = "employee" } = req.body as {
      email?: string;
      role?: string;
    };
    if (!email?.trim()) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Email is required.",
      });
    }

    const VALID_ROLES = ["admin", "hr", "manager", "employee"];
    if (!VALID_ROLES.includes(role)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`,
      });
    }

    // Check if already a member
    const existingUser = await prisma.user.findFirst({
      where: { email: email.trim() },
    });
    if (existingUser) {
      const alreadyMember = await prisma.tenantMembership.findFirst({
        where: { tenantId, userId: existingUser.id },
      });
      if (alreadyMember) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: "User is already a member of this organisation.",
        });
      }
    }

    // Expire old pending invites for this email in this tenant
    await prisma.tenantInvite.updateMany({
      where: { tenantId, email: email.trim(), used: false },
      data: { used: true },
    });

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.tenantInvite.create({
      data: {
        tenantId,
        email: email.trim(),
        role,
        token,
        expiresAt,
        invitedBy: userId,
      },
    });

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        inviteId: invite.id,
        token,
        email: invite.email,
        role: invite.role,
        expiresAt: invite.expiresAt,
        // Frontend constructs the invite URL: /invite?token=TOKEN
        inviteUrl: `${process.env.CLIENT_URL?.split(",")[0].trim()}/invite?token=${token}`,
        tenantName: tenant?.name,
      },
      message: "Invite created successfully.",
    });
  } catch (err) {
    logger.error("inviteUser error:", { err });
    return handleError(res, err);
  }
}

// GET /api/v1/tenants/invite/:token — resolve an invite (public, for the invite landing page)
export async function resolveInvite(req: Request, res: Response) {
  try {
    const token = String(req.params.token);
    const invite = await prisma.tenantInvite.findFirst({
      where: { token, used: false, expiresAt: { gt: new Date() } },
    });

    if (!invite) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Invite not found or has expired.",
      });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: invite.tenantId },
      select: { id: true, name: true, slug: true },
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        email: invite.email,
        role: invite.role,
        tenant,
        expiresAt: invite.expiresAt,
      },
    });
  } catch (err) {
    logger.error("resolveInvite error:", { err });
    return handleError(res, err);
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
  } catch (err) {
    logger.error("listAvailableTenants error:", { err });
    return handleError(res, err);
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
  } catch (err) {
    return handleError(res, err);
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
  } catch (err) {
    return handleError(res, err);
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
        website: true,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { orgProfile: tenant },
    });
  } catch (err) {
    return handleError(res, err);
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
    (actor?.permissions ?? []).some((p: string) =>
      p.startsWith("CompanyInfo:"),
    );
  if (!canEdit) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "You don't have permission to update the organisation profile.",
    });
  }
  try {
    const { helpPhone, helpEmail, officeAddress, website } = req.body as {
      helpPhone?: string;
      helpEmail?: string;
      officeAddress?: string;
      website?: string;
    };
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(helpPhone !== undefined && { helpPhone: helpPhone || null }),
        ...(helpEmail !== undefined && { helpEmail: helpEmail || null }),
        ...(officeAddress !== undefined && {
          officeAddress: officeAddress || null,
        }),
        ...(website !== undefined && { website: website || null }),
      },
      select: {
        name: true,
        helpPhone: true,
        helpEmail: true,
        officeAddress: true,
        website: true,
      },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { orgProfile: tenant },
      message: "Organisation profile updated.",
    });
  } catch (err) {
    return handleError(res, err);
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
        expiresIn: (process.env.ACCESS_JWT_EXPIRE || "1h") as any,
      },
    );

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: { accessToken } });
  } catch (err) {
    logger.error("completeOrgSetup error:", { err });
    return handleError(res, err);
  }
}

// DELETE /api/v1/tenants/invite/:id — revoke a pending invite
export async function revokeInvite(req: AuthRequest, res: Response) {
  const { tenantId, tenantRole } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  if (!["owner", "admin"].includes(tenantRole ?? "")) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can revoke invites.",
    });
  }
  try {
    const id = String(req.params.id);
    const invite = await prisma.tenantInvite.findFirst({
      where: { id, tenantId, used: false },
    });
    if (!invite) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Invite not found.",
      });
    }
    await prisma.tenantInvite.update({ where: { id }, data: { used: true } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Invite revoked.",
    });
  } catch (err) {
    return handleError(res, err);
  }
}
