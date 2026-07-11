import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { isSuperUser } from "../utils/user";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fields returned to the client – omits internal Prisma fields. */
export function toPublic(s: any) {
  return {
    id: s.id,
    effectiveFrom: s.effectiveFrom,
    note: s.note ?? null,
    // Work week
    workWeekPattern: s.workWeekPattern ?? SETTINGS_DEFAULTS.workWeekPattern,
    // Leave
    paidLeavesPerYear: s.paidLeavesPerYear,
    sickLeavesPerYear: s.sickLeavesPerYear,
    casualLeavesPerYear: s.casualLeavesPerYear,
    medicalCertRequired: s.medicalCertRequired,
    customLeaveTypes: s.customLeaveTypes ?? [],
    leavePolicies: s.leavePolicies ?? [],
    // Attendance
    workStartHour: s.workStartHour,
    workStartMinute: s.workStartMinute,
    lateGracePeriodMinutes: s.lateGracePeriodMinutes,
    fullDayMinHours: s.fullDayMinHours,
    halfDayMinHours: s.halfDayMinHours,
    regularizationBackdateWindowDays: s.regularizationBackdateWindowDays ?? 3,
    overtimePreApprovalRequired: s.overtimePreApprovalRequired ?? false,
    // Geofencing
    geofencingEnabled: s.geofencingEnabled ?? false,
    officeLatitude: s.officeLatitude ?? null,
    officeLongitude: s.officeLongitude ?? null,
    officeName: s.officeName ?? null,
    geofenceRadiusMeters: s.geofenceRadiusMeters ?? 200,
    // HR
    probationPeriodDays: s.probationPeriodDays,
    noticePeriodDays: s.noticePeriodDays,
    maxInterviewRounds:
      s.maxInterviewRounds ?? SETTINGS_DEFAULTS.maxInterviewRounds,
  };
}

/** Schema defaults — mirrors Prisma field defaults; used only when no DB record exists yet. */
export const SETTINGS_DEFAULTS = {
  workWeekPattern: { type: "mon_fri", workingDays: [1, 2, 3, 4, 5] } as {
    type: "mon_fri" | "mon_sat" | "custom";
    workingDays: number[];
  },
  paidLeavesPerYear: 12,
  sickLeavesPerYear: 12,
  casualLeavesPerYear: 6,
  medicalCertRequired: false,
  customLeaveTypes: [] as any[],
  leavePolicies: [] as any[],
  workStartHour: 9,
  workStartMinute: 0,
  lateGracePeriodMinutes: 30,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
  regularizationBackdateWindowDays: 3,
  overtimePreApprovalRequired: false,
  probationPeriodDays: 90,
  noticePeriodDays: 30,
  maxInterviewRounds: 5,
  // Geofencing
  geofencingEnabled: false,
  officeLatitude: null as number | null,
  officeLongitude: null as number | null,
  officeName: null as string | null,
  geofenceRadiusMeters: 200,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns the currently *active* settings row:
 *   latest version where effectiveFrom ≤ now
 */
export async function getActiveSettings(tenantId: string) {
  return (prisma as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
  });
}

/**
 * Returns all future (pending) settings rows ordered by effectiveFrom asc.
 */
async function getPendingSettings(tenantId: string) {
  return (prisma as any).tenantSettings.findMany({
    where: { tenantId, effectiveFrom: { gt: new Date() } },
    orderBy: { effectiveFrom: "asc" },
  });
}

/**
 * Merges a validated partial patch onto the current active settings snapshot
 * and writes it as a new immutable version (or overwrites a same-`effectiveFrom`
 * row from a double-submit). Shared by the full org-settings save flow and any
 * narrower, single-section save flow (e.g. leave policy) that only wants to
 * patch its own fields without resubmitting the whole form.
 */
export async function writeVersionedSettings(
  tenantId: string,
  userId: string,
  validated: Record<string, any>,
  effectiveFrom: Date,
  note?: string,
): Promise<{ settings: ReturnType<typeof toPublic>; message: string }> {
  const currentActive = await getActiveSettings(tenantId);
  const base = currentActive
    ? {
        workWeekPattern:
          currentActive.workWeekPattern ?? SETTINGS_DEFAULTS.workWeekPattern,
        paidLeavesPerYear: currentActive.paidLeavesPerYear,
        sickLeavesPerYear: currentActive.sickLeavesPerYear,
        casualLeavesPerYear: currentActive.casualLeavesPerYear,
        medicalCertRequired: currentActive.medicalCertRequired,
        customLeaveTypes: currentActive.customLeaveTypes,
        leavePolicies:
          currentActive.leavePolicies ?? SETTINGS_DEFAULTS.leavePolicies,
        workStartHour: currentActive.workStartHour,
        workStartMinute: currentActive.workStartMinute,
        lateGracePeriodMinutes: currentActive.lateGracePeriodMinutes,
        fullDayMinHours: currentActive.fullDayMinHours,
        halfDayMinHours: currentActive.halfDayMinHours,
        regularizationBackdateWindowDays:
          currentActive.regularizationBackdateWindowDays ??
          SETTINGS_DEFAULTS.regularizationBackdateWindowDays,
        overtimePreApprovalRequired:
          currentActive.overtimePreApprovalRequired ??
          SETTINGS_DEFAULTS.overtimePreApprovalRequired,
        probationPeriodDays: currentActive.probationPeriodDays,
        noticePeriodDays: currentActive.noticePeriodDays,
        maxInterviewRounds:
          currentActive.maxInterviewRounds ??
          SETTINGS_DEFAULTS.maxInterviewRounds,
        geofencingEnabled: currentActive.geofencingEnabled ?? false,
        officeLatitude: currentActive.officeLatitude ?? null,
        officeLongitude: currentActive.officeLongitude ?? null,
        officeName: currentActive.officeName ?? null,
        geofenceRadiusMeters: currentActive.geofenceRadiusMeters ?? 200,
      }
    : SETTINGS_DEFAULTS;

  const merged = { ...base, ...validated };
  const isImmediate = effectiveFrom <= new Date();

  let row;
  if (isImmediate && currentActive) {
    // Immediate save with an active version already in place: update that
    // row instead of minting a new version for every routine edit. The
    // versioned-history mechanism is reserved for its actual purpose —
    // forward-dated "schedule for later" changes — so this is the only
    // branch that mutates a row in place rather than appending one.
    row = await (prisma as any).tenantSettings.update({
      where: { id: currentActive.id },
      data: { ...merged, note: note ?? null, createdBy: userId },
    });
  } else {
    // No active version yet, or this is a forward-dated scheduled change.
    // Check whether a version with the same effectiveFrom already exists for
    // this tenant (e.g. admin clicks Save twice in quick succession).
    const existing = await (prisma as any).tenantSettings.findFirst({
      where: { tenantId, effectiveFrom },
    });
    row = existing
      ? await (prisma as any).tenantSettings.update({
          where: { id: existing.id },
          data: { ...merged, note: note ?? null, createdBy: userId },
        })
      : await (prisma as any).tenantSettings.create({
          data: {
            tenantId,
            effectiveFrom,
            ...merged,
            note: note ?? null,
            createdBy: userId,
          },
        });
  }

  // Every leave-service/attendance-service settings read is cached (up to 15
  // min TTL). Only a row that's already active can change what those
  // services should be resolving right now — a future-dated (pending) write
  // doesn't need this, since nothing has cached it as "active" yet. Redis is
  // shared across services, so deleting the key here is visible to them
  // immediately; each service's own short-lived (5 min) in-process L1 cache
  // is the only remaining staleness window.
  if (effectiveFrom <= new Date()) {
    await Promise.all([
      cacheManager.delete(`tenantSettings:attendance:${tenantId}`),
      cacheManager.delete(`tenantSettings:leave:${tenantId}`),
    ]).catch((err) =>
      logger.warn("[writeVersionedSettings] Cache invalidation failed:", {
        err,
      }),
    );
  }

  return {
    settings: toPublic(row),
    message:
      effectiveFrom <= new Date()
        ? "Settings applied immediately."
        : `Settings scheduled for ${effectiveFrom.toISOString().slice(0, 10)}.`,
  };
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/tenant-settings
 * Any authenticated member may read.
 * Returns { active: Settings, pending: Settings[] }
 */
export async function getTenantSettings(req: AuthRequest, res: Response) {
  const { tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }
  try {
    const [active, pending] = await Promise.all([
      getActiveSettings(tenantId),
      getPendingSettings(tenantId),
    ]);

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        active: active
          ? toPublic(active)
          : { ...SETTINGS_DEFAULTS, effectiveFrom: null, id: null, note: null },
        pending: pending.map(toPublic),
      },
    });
  } catch (error: unknown) {
    logger.error("getTenantSettings error:", { error });
    return handleError(res, error);
  }
}

/**
 * PUT /api/v1/tenant-settings
 * Creates a new immutable settings version.
 * Body: { settings: {...}, effectiveFrom?: ISO-date, note?: string }
 * Only owners, admins, and superusers may write.
 */
export async function updateTenantSettings(req: AuthRequest, res: Response) {
  const { userId, tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }

  const superUser = await isSuperUser(userId);

  const isPrivileged =
    superUser || ["owner", "admin"].includes(req.user!.tenantRole ?? "");

  if (!isPrivileged) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can update organisation settings.",
    });
  }

  try {
    const {
      settings: body = {},
      effectiveFrom: rawEffectiveFrom,
      note,
    } = req.body as {
      settings?: Record<string, any>;
      effectiveFrom?: string;
      note?: string;
    };

    // Resolve effectiveFrom — defaults to NOW (immediate effect).
    let effectiveFrom: Date;
    if (rawEffectiveFrom) {
      effectiveFrom = new Date(rawEffectiveFrom);
      if (isNaN(effectiveFrom.getTime())) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: "Invalid effectiveFrom date.",
        });
      }
    } else {
      effectiveFrom = new Date();
    }

    // Validate fields present in the payload.
    const validated: Record<string, any> = {};

    const intField = (key: string, min = 0) => {
      if (body[key] !== undefined) {
        const v = Number(body[key]);
        if (isNaN(v) || v < min) {
          throw new Error(`${key} must be a number ≥ ${min}.`);
        }
        validated[key] = v;
      }
    };

    if (body.workWeekPattern !== undefined) {
      const wp = body.workWeekPattern;
      if (
        !wp ||
        !["mon_fri", "mon_sat", "custom"].includes(wp.type) ||
        !Array.isArray(wp.workingDays) ||
        wp.workingDays.some(
          (d: unknown) => typeof d !== "number" || d < 0 || d > 6,
        )
      ) {
        throw new Error(
          'workWeekPattern must be { type: "mon_fri"|"mon_sat"|"custom", workingDays: number[] (0-6) }.',
        );
      }
      validated.workWeekPattern = wp;
    }

    intField("paidLeavesPerYear");
    intField("sickLeavesPerYear");
    intField("casualLeavesPerYear");
    if (body.medicalCertRequired !== undefined)
      validated.medicalCertRequired = Boolean(body.medicalCertRequired);
    if (body.customLeaveTypes !== undefined) {
      if (!Array.isArray(body.customLeaveTypes))
        throw new Error("customLeaveTypes must be an array.");
      validated.customLeaveTypes = body.customLeaveTypes;
    }
    if (body.leavePolicies !== undefined) {
      if (!Array.isArray(body.leavePolicies))
        throw new Error("leavePolicies must be an array.");
      validated.leavePolicies = body.leavePolicies;
    }

    if (body.workStartHour !== undefined) {
      const h = Number(body.workStartHour);
      if (h < 0 || h > 23) throw new Error("workStartHour must be 0–23.");
      validated.workStartHour = h;
    }
    if (body.workStartMinute !== undefined) {
      const m = Number(body.workStartMinute);
      if (m < 0 || m > 59) throw new Error("workStartMinute must be 0–59.");
      validated.workStartMinute = m;
    }
    intField("lateGracePeriodMinutes");
    if (body.fullDayMinHours !== undefined)
      validated.fullDayMinHours = Math.max(0.5, Number(body.fullDayMinHours));
    if (body.halfDayMinHours !== undefined)
      validated.halfDayMinHours = Math.max(0.5, Number(body.halfDayMinHours));
    intField("regularizationBackdateWindowDays");
    if (body.overtimePreApprovalRequired !== undefined)
      validated.overtimePreApprovalRequired = Boolean(
        body.overtimePreApprovalRequired,
      );
    intField("probationPeriodDays");
    intField("noticePeriodDays");
    intField("maxInterviewRounds", 1);

    // Geofencing
    if (body.geofencingEnabled !== undefined)
      validated.geofencingEnabled = Boolean(body.geofencingEnabled);
    if (body.officeLatitude !== undefined)
      validated.officeLatitude =
        body.officeLatitude == null ? null : Number(body.officeLatitude);
    if (body.officeLongitude !== undefined)
      validated.officeLongitude =
        body.officeLongitude == null ? null : Number(body.officeLongitude);
    if (body.officeName !== undefined)
      validated.officeName = body.officeName ?? null;
    if (body.geofenceRadiusMeters !== undefined)
      validated.geofenceRadiusMeters = Math.max(
        50,
        Number(body.geofenceRadiusMeters),
      );

    const { settings, message } = await writeVersionedSettings(
      tenantId,
      userId,
      validated,
      effectiveFrom,
      note,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { settings },
      message,
    });
  } catch (error: any) {
    if (error?.message && !error?.code) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: error.message,
      });
    }
    logger.error("updateTenantSettings error:", { error });
    return handleError(res, error);
  }
}

/**
 * DELETE /api/v1/tenant-settings/pending/:id
 * Cancels a single pending (future) settings version.
 * Only owners / admins / superusers.
 */
export async function cancelPendingSettings(req: AuthRequest, res: Response) {
  const { userId, tenantId } = req.user!;
  if (!tenantId) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "No active tenant.",
    });
  }

  const superUser = await isSuperUser(userId);
  const isPrivileged =
    superUser || ["owner", "admin"].includes(req.user!.tenantRole ?? "");

  if (!isPrivileged) {
    return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
      message: "Only owners and admins can cancel pending settings.",
    });
  }

  try {
    const { id } = req.params;
    const record = await (prisma as any).tenantSettings.findFirst({
      where: { id, tenantId, effectiveFrom: { gt: new Date() } },
    });
    if (!record) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Pending settings version not found.",
      });
    }
    await (prisma as any).tenantSettings.delete({ where: { id } });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pending settings change cancelled.",
    });
  } catch (error: unknown) {
    logger.error("cancelPendingSettings error:", { error });
    return handleError(res, error);
  }
}
