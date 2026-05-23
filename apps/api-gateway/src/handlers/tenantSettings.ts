import { Response } from "express";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fields returned to the client – omits internal Prisma fields. */
function toPublic(s: any) {
  return {
    id: s.id,
    effectiveFrom: s.effectiveFrom,
    note: s.note ?? null,
    // Leave
    paidLeavesPerYear: s.paidLeavesPerYear,
    sickLeavesPerYear: s.sickLeavesPerYear,
    casualLeavesPerYear: s.casualLeavesPerYear,
    medicalCertRequired: s.medicalCertRequired,
    customLeaveTypes: s.customLeaveTypes ?? [],
    // Attendance
    workStartHour: s.workStartHour,
    workStartMinute: s.workStartMinute,
    lateGracePeriodMinutes: s.lateGracePeriodMinutes,
    fullDayMinHours: s.fullDayMinHours,
    halfDayMinHours: s.halfDayMinHours,
    // Geofencing
    geofencingEnabled: s.geofencingEnabled ?? false,
    officeLatitude: s.officeLatitude ?? null,
    officeLongitude: s.officeLongitude ?? null,
    officeName: s.officeName ?? null,
    geofenceRadiusMeters: s.geofenceRadiusMeters ?? 200,
    // HR
    probationPeriodDays: s.probationPeriodDays,
    noticePeriodDays: s.noticePeriodDays,
  };
}

/** Schema defaults — mirrors Prisma field defaults; used only when no DB record exists yet. */
export const SETTINGS_DEFAULTS = {
  paidLeavesPerYear: 12,
  sickLeavesPerYear: 12,
  casualLeavesPerYear: 6,
  medicalCertRequired: false,
  customLeaveTypes: [] as any[],
  workStartHour: 9,
  workStartMinute: 0,
  lateGracePeriodMinutes: 30,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
  probationPeriodDays: 90,
  noticePeriodDays: 30,
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
async function getActiveSettings(tenantId: string) {
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
  } catch (err) {
    logger.error("getTenantSettings error:", { err });
    return handleError(res, err);
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

  const actor = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });

  const isPrivileged =
    actor?.isSuperUser ||
    ["owner", "admin"].includes(req.user!.tenantRole ?? "");

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
    intField("probationPeriodDays");
    intField("noticePeriodDays");

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

    // Merge validated fields onto the current active settings so the new
    // version is a complete snapshot, not a sparse patch.
    const currentActive = await getActiveSettings(tenantId);
    const base = currentActive
      ? {
          paidLeavesPerYear: currentActive.paidLeavesPerYear,
          sickLeavesPerYear: currentActive.sickLeavesPerYear,
          casualLeavesPerYear: currentActive.casualLeavesPerYear,
          medicalCertRequired: currentActive.medicalCertRequired,
          customLeaveTypes: currentActive.customLeaveTypes,
          workStartHour: currentActive.workStartHour,
          workStartMinute: currentActive.workStartMinute,
          lateGracePeriodMinutes: currentActive.lateGracePeriodMinutes,
          fullDayMinHours: currentActive.fullDayMinHours,
          halfDayMinHours: currentActive.halfDayMinHours,
          probationPeriodDays: currentActive.probationPeriodDays,
          noticePeriodDays: currentActive.noticePeriodDays,
          geofencingEnabled: currentActive.geofencingEnabled ?? false,
          officeLatitude: currentActive.officeLatitude ?? null,
          officeLongitude: currentActive.officeLongitude ?? null,
          officeName: currentActive.officeName ?? null,
          geofenceRadiusMeters: currentActive.geofenceRadiusMeters ?? 200,
        }
      : SETTINGS_DEFAULTS;

    const merged = { ...base, ...validated };

    // Check whether a version with the same effectiveFrom already exists for
    // this tenant (e.g. admin clicks Save twice in quick succession).
    const existing = await (prisma as any).tenantSettings.findFirst({
      where: { tenantId, effectiveFrom },
    });
    if (existing) {
      // Overwrite it instead of duplicating.
      const updated = await (prisma as any).tenantSettings.update({
        where: { id: existing.id },
        data: { ...merged, note: note ?? null, createdBy: userId },
      });
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: { settings: toPublic(updated) },
        message:
          effectiveFrom <= new Date()
            ? "Settings applied immediately."
            : `Settings scheduled for ${effectiveFrom.toISOString().slice(0, 10)}.`,
      });
    }

    const created = await (prisma as any).tenantSettings.create({
      data: {
        tenantId,
        effectiveFrom,
        ...merged,
        note: note ?? null,
        createdBy: userId,
      },
    });

    const isImmediate = effectiveFrom <= new Date();
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: { settings: toPublic(created) },
      message: isImmediate
        ? "Settings applied immediately."
        : `Settings scheduled for ${effectiveFrom.toISOString().slice(0, 10)}.`,
    });
  } catch (err: any) {
    if (err?.message && !err?.code) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: err.message,
      });
    }
    logger.error("updateTenantSettings error:", { err });
    return handleError(res, err);
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

  const actor = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  const isPrivileged =
    actor?.isSuperUser ||
    ["owner", "admin"].includes(req.user!.tenantRole ?? "");

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
  } catch (err) {
    logger.error("cancelPendingSettings error:", { err });
    return handleError(res, err);
  }
}
