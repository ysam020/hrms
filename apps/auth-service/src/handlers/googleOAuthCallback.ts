import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma, canonicalizeEmail, generateUniqueUsername } from "@hrms/db";
import { signAccessToken, signRefreshToken } from "../services/jwt";
import { storeRefreshToken } from "../services/redis";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

const BLOCKED_STATUSES = ["Terminated", "Absconded", "Resigned"];

export const googleOAuthCallback = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { code } = call.request;

    if (!code) {
      return callback(null, {
        message: MESSAGES.AUTHORIZATION_CODE_REQUIRED,
        status: status.INVALID_ARGUMENT,
        accessToken: "",
        refreshToken: "",
        data: {
          id: "",
          email: "",
          username: "",
          role: "",
          firstName: "",
          lastName: "",
          tenantId: "",
          tenantRole: "",
        },
        needsTenantSetup: false,
        tenants: [],
      });
    }

    // Exchange code for Google access token
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_CALLBACK_URL!,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      logger.error("Google token exchange failed:", { err });
      return callback(null, {
        message: MESSAGES.FAILED_TO_EXCHANGE_CODE,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
        data: {
          id: "",
          email: "",
          username: "",
          role: "",
          firstName: "",
          lastName: "",
          tenantId: "",
          tenantRole: "",
        },
        needsTenantSetup: false,
        tenants: [],
      });
    }

    const tokenData = (await tokenRes.json()) as any;

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );

    if (!profileRes.ok) {
      return callback(null, {
        message: MESSAGES.FAILED_TO_GET_PROFILE,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
        data: {
          id: "",
          email: "",
          username: "",
          role: "",
          firstName: "",
          lastName: "",
          tenantId: "",
          tenantRole: "",
        },
        needsTenantSetup: false,
        tenants: [],
      });
    }

    const profile = (await profileRes.json()) as any;
    const email: string = profile.email ? canonicalizeEmail(profile.email) : "";

    if (!email) {
      return callback(null, {
        message: MESSAGES.NO_EMAIL_FROM_GOOGLE,
        status: status.UNAUTHENTICATED,
        accessToken: "",
        refreshToken: "",
        data: {
          id: "",
          email: "",
          username: "",
          role: "",
          firstName: "",
          lastName: "",
          tenantId: "",
          tenantRole: "",
        },
        needsTenantSetup: false,
        tenants: [],
      });
    }

    let resolvedTenantId: string | null = null;
    let resolvedTenantRole: string | null = null;

    // ── Find or create user (cross-tenant lookup by globally unique email) ────
    let user = await prisma.user.findFirst({ where: { email } });

    if (user) {
      if (BLOCKED_STATUSES.includes(user.employeeStatus)) {
        const reasons: Record<string, string> = {
          Terminated: "Your account has been terminated.",
          Absconded: "Your account has been marked as absconded.",
          Resigned: "Your account access has been revoked.",
        };
        return callback(null, {
          message: reasons[user.employeeStatus] || MESSAGES.ACCESS_DENIED,
          status: status.PERMISSION_DENIED,
          accessToken: "",
          refreshToken: "",
          data: {
            id: "",
            email: "",
            username: "",
            role: "",
            firstName: "",
            lastName: "",
            tenantId: "",
            tenantRole: "",
          },
          needsTenantSetup: false,
          tenants: [],
        });
      }
    } else {
      // Auto-register new user (no tenant yet)
      const username = await generateUniqueUsername(email);
      const nameParts = (profile.name || "").split(" ");
      const firstName = (nameParts[0] || "").toUpperCase();
      const lastName = nameParts.slice(1).join(" ").toUpperCase();

      user = await prisma.user.create({
        data: {
          username,
          email,
          first_name: firstName,
          last_name: lastName,
          employee_photo: profile.picture || null,
          // Not "Active" until approveJoinRequest (join an existing tenant)
          // or buildTenant (create/own a new one) actually admits them — see
          // BLOCKED_STATUSES above, which deliberately excludes "Pending" so
          // they can still log in and reach tenant setup / join-request
          // screens while awaiting that.
          employeeStatus: "Pending",
          isSuperUser: false,
        },
      });
    }

    // ── Resolve tenant membership ──────────────────────────────────────────────

    const memberships = await prisma.tenantMembership.findMany({
      where: { userId: user.id },
      take: 10,
    });

    if (memberships.length === 0 && user.tenantId) {
      // User.tenantId is stamped but the membership row is missing
      // (e.g. left behind by a raw data migration) — self-heal instead
      // of sending an already-onboarded user back to org setup.
      const staleTenant = await prisma.tenant.findUnique({
        where: { id: user.tenantId },
      });
      if (staleTenant?.isActive) {
        const inferredRole = user.isSuperUser ? "owner" : "employee";
        const healedMembership = await prisma.tenantMembership.create({
          data: {
            tenantId: staleTenant.id,
            userId: user.id,
            role: inferredRole,
          },
        });
        logger.warn(
          "Self-healed missing TenantMembership for user with stamped tenantId",
          { userId: user.id, tenantId: staleTenant.id, role: inferredRole },
        );
        memberships.push(healedMembership);
      } else {
        logger.warn(
          "User.tenantId points at a missing/inactive tenant — clearing stale reference",
          { userId: user.id, tenantId: user.tenantId },
        );
        user = await prisma.user.update({
          where: { id: user.id },
          data: { tenantId: null },
        });
      }
    }

    if (memberships.length === 0) {
      // No tenant yet — issue a "pendingSetup" token
      const accessToken = signAccessToken({
        userId: user.id,
        tenantId: null,
        tenantRole: null,
        pendingSetup: true,
        orgSetupComplete: true,
        dbName: null,
      });
      const refreshToken = signRefreshToken(user.id);
      await storeRefreshToken(
        user.id,
        refreshToken,
        null,
        null,
        undefined,
        null,
      );

      return callback(null, {
        message: "Please create or join an organisation to continue.",
        status: status.OK,
        accessToken,
        refreshToken,
        data: {
          id: user.id,
          email: user.email || "",
          username: user.username,
          role: (user.role ?? []).join(","),
          firstName: user.first_name || "",
          lastName: user.last_name || "",
          tenantId: "",
          tenantRole: "",
        },
        needsTenantSetup: true,
        tenants: [],
      });
    }

    if (memberships.length > 1) {
      // Multiple tenants — need picker; issue pendingSetup token
      const tenants = await prisma.tenant.findMany({
        where: { id: { in: memberships.map((m) => m.tenantId) } },
        select: { id: true, name: true, slug: true },
      });

      const accessToken = signAccessToken({
        userId: user.id,
        tenantId: null,
        tenantRole: null,
        pendingSetup: true,
        orgSetupComplete: true,
        dbName: null,
      });
      const refreshToken = signRefreshToken(user.id);
      await storeRefreshToken(
        user.id,
        refreshToken,
        null,
        null,
        undefined,
        null,
      );

      return callback(null, {
        message: "Select a tenant to continue.",
        status: status.OK,
        accessToken,
        refreshToken,
        data: {
          id: user.id,
          email: user.email || "",
          username: user.username,
          role: "",
          firstName: user.first_name || "",
          lastName: user.last_name || "",
          tenantId: "",
          tenantRole: "",
        },
        needsTenantSetup: false,
        tenants: tenants.map((t) => {
          const m = memberships.find((m) => m.tenantId === t.id)!;
          return { id: t.id, name: t.name, slug: t.slug, role: m.role };
        }),
      });
    }

    // Exactly one tenant — resolve it
    const membership = memberships[0];
    resolvedTenantId = membership.tenantId;
    resolvedTenantRole = membership.role;

    if (!user.tenantId) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { tenantId: resolvedTenantId },
      });
    }

    // ── Issue tokens ───────────────────────────────────────────────────────────
    const resolvedTenant = resolvedTenantId
      ? await prisma.tenant.findUnique({
          where: { id: resolvedTenantId },
          select: { dbName: true },
        })
      : null;
    const resolvedDbName = resolvedTenant?.dbName ?? null;

    const accessToken = signAccessToken({
      userId: user.id,
      tenantId: resolvedTenantId,
      tenantRole: resolvedTenantRole,
      pendingSetup: false,
      orgSetupComplete: true,
      dbName: resolvedDbName,
    });
    const refreshToken = signRefreshToken(user.id);
    await storeRefreshToken(
      user.id,
      refreshToken,
      resolvedTenantId,
      resolvedTenantRole,
      undefined,
      resolvedDbName,
    );

    return callback(null, {
      message: MESSAGES.LOGIN_SUCCESSFUL,
      status: status.OK,
      accessToken,
      refreshToken,
      data: {
        id: user.id,
        email: user.email || "",
        username: user.username,
        role: (user.role ?? []).join(","),
        firstName: user.first_name || "",
        lastName: user.last_name || "",
        tenantId: resolvedTenantId || "",
        tenantRole: resolvedTenantRole || "",
      },
      needsTenantSetup: false,
      tenants: [],
    });
  } catch (err) {
    logger.error("GoogleOAuthCallback error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      accessToken: "",
      refreshToken: "",
      data: {
        id: "",
        email: "",
        username: "",
        role: "",
        firstName: "",
        lastName: "",
        tenantId: "",
        tenantRole: "",
      },
      needsTenantSetup: false,
      tenants: [],
    });
  }
};
