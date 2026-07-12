/**
 * WFH Request Flow handler – gateway-direct.
 *
 * This closes the gap where `User.wfh` was a static boolean toggled by HR.
 * Now employees submit daily WFH requests; managers approve/reject.
 *
 * Attendance integration:
 *  – markAttendance's geofencing check looks up an Approved WfhRequest for
 *    today before deciding whether to fence against the office or the
 *    employee's home location.
 *  – An approved WFH day is recorded as status="WFH" in AttendanceRecord
 *    (see the "wfh" MODULE_SIDE_EFFECTS callback in approvalChains.ts),
 *    which also keeps reconcileAttendance from marking the day Absent.
 *
 * Approval:
 *  – Requests are routed through @hrms/approval-engine (same mechanism as
 *    Leave/Resignation/Overtime) — resolves to the requester's reporting
 *    manager by default, or a tenant-configured ApprovalChain for the "wfh"
 *    module. This also closes a prior self-approval gap: a plain "manager"
 *    role could approve their own request under the old bespoke check;
 *    resolveReportingManager() never resolves the approver to the requester
 *    themselves, and actOnStep() rejects any actor who isn't the resolved
 *    approver unless privileged (owner/admin/hr, or an explicit WFH:approve
 *    grant).
 *
 * Security:
 *  – Employees can only request for themselves.
 *  – Past dates cannot be requested (prevents gaming).
 *  – Same day can only have one request (@@unique enforced at DB).
 */

import { Request, Response, NextFunction } from "express";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest, AuthUser } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { instantiateApproval, cancelApproval } from "@hrms/approval-engine";
import { actOnApprovalForEntity } from "./approvalChains";
import { getActiveSettings } from "./tenantSettings";
import { getWorkingDays, isHoliday, eachDate } from "../utils/workingDays";

dayjs.extend(utc);

// tenantRole comes from the JWT (resolved from TenantMembership at login) —
// User.role is a legacy, never-populated field and must not be used here.
// Used both for "can see everyone's requests" (list/calendar) and as the
// approval-engine's `allowOverride` flag (owner/admin/hr, or an explicit
// WFH:approve grant, may act on any pending request regardless of who the
// chain resolved as the approver).
async function isWfhPrivileged(
  authUser: AuthUser | undefined,
): Promise<boolean> {
  if (!authUser) return false;
  if (["owner", "admin", "hr"].includes(authUser.tenantRole ?? "")) return true;
  const user = await prisma.user.findUnique({
    where: { id: authUser.userId },
    select: { isSuperUser: true, permissions: true },
  });
  if (!user) return false;
  if (user.isSuperUser) return true;
  return ((user.permissions as string[]) ?? []).includes("WFH:approve");
}

/**
 * WFH is a hard tenant-level kill switch — when a tenant has disabled it in
 * Organisation Settings, every WFH route is closed to everyone, including
 * superusers/owners/admins. No override.
 */
export async function requireWfhEnabled(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { user } = req as AuthRequest;
  const tenantId = user?.tenantId;
  if (!tenantId) {
    res.status(403).json({ message: "No active tenant." });
    return;
  }
  const settings = await getActiveSettings(tenantId);
  if (settings?.wfhEnabled === false) {
    res.status(403).json({ message: "WFH is disabled for this organisation." });
    return;
  }
  next();
}

function toUtcMidnight(dateStr: string): Date {
  return dayjs.utc(dateStr).startOf("day").toDate();
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /wfh/requests
 * Employee submits a WFH request for a date, or a date range (inclusive).
 * Omit `toDate` for a single-day request.
 */
export async function requestWfh(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const {
      date,
      toDate: toDateStr,
      reason,
    } = req.body as { date: string; toDate?: string; reason?: string };
    const tenantId = user?.tenantId;
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "No active tenant.",
      });
    }

    const requestedDate = toUtcMidnight(date);
    const requestedToDate = toUtcMidnight(toDateStr ?? date);
    const today = dayjs.utc().startOf("day");

    if (dayjs.utc(requestedToDate).isBefore(dayjs.utc(requestedDate))) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "End date cannot be before the start date",
      });
    }

    // Reject past dates (allow same-day only if before work-start).
    if (dayjs.utc(requestedDate).isBefore(today)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot request WFH for a past date",
      });
    }

    // Reject non-working days per the tenant's configured work week (falls
    // back to Mon-Fri), and tenant-declared holidays — a range just needs at
    // least one working day in it, individual weekends/holidays inside the
    // range are simply skipped (same as how Leave doesn't reject a
    // Friday-Monday request just because the weekend falls in between).
    const settings = await getActiveSettings(tenantId);
    const workingDays = getWorkingDays(settings);
    const allDates = eachDate(requestedDate, requestedToDate);
    const workingDates: Date[] = [];
    for (const d of allDates) {
      const dow = dayjs.utc(d).day();
      if (!workingDays.includes(dow)) continue;
      if (await isHoliday(d)) continue;
      workingDates.push(d);
    }
    if (workingDates.length === 0) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "The selected range has no working days (all weekends/holidays)",
      });
    }

    // Check for an existing leave application overlapping the range.
    const existingLeave = await prisma.leaveApplication.findFirst({
      where: {
        userId: user!.userId,
        from: { lte: requestedToDate },
        to: { gte: requestedDate },
        status: { in: ["Pending", "Approved"] },
      },
    });
    if (existingLeave) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "You already have a leave application overlapping this range",
      });
    }

    // Check for an existing WFH request overlapping the range — no DB unique
    // constraint anymore now that requests span a range, so this has to be
    // an application-level check.
    const existingWfh = await prisma.wfhRequest.findFirst({
      where: {
        userId: user!.userId,
        status: { in: ["Pending", "Approved"] },
        date: { lte: requestedToDate },
        toDate: { gte: requestedDate },
      },
    });
    if (existingWfh) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "You already have a WFH request overlapping this range",
      });
    }

    const wfhReq = await prisma.wfhRequest.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        userId: user!.userId,
        date: requestedDate,
        toDate: requestedToDate,
        reason: reason ?? null,
        status: "Pending",
      },
    });

    await instantiateApproval(tenantId, "wfh", wfhReq.id, user!.userId, {
      date: date,
      toDate: toDateStr ?? date,
    });

    logger.info(
      `WFH request created: ${wfhReq.id} for ${date}${toDateStr ? ` to ${toDateStr}` : ""}`,
      { userId: user!.userId },
    );

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "WFH request submitted",
      data: {
        requestId: wfhReq.id,
        date,
        toDate: toDateStr ?? date,
        status: "Pending",
      },
    });
  } catch (error) {
    logger.error("POST /wfh/requests error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /wfh/requests
 * Approvers see all pending requests; employees see their own.
 */
export async function listWfhRequests(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const isApprover = await isWfhPrivileged(user);
    const {
      status,
      userId: targetId,
      from,
      to,
    } = req.query as Record<string, string>;
    const { page, limit } = parsePagination(req.query);
    const skip = (page - 1) * limit;
    const take = limit;

    const where: any = {};
    if (!isApprover) {
      where.userId = user!.userId;
    } else if (targetId) {
      where.userId = targetId;
    }
    if (status) where.status = status;
    // Overlap with the [from, to] filter window, not just an exact `date`
    // match — a range request should show up if any part of it falls inside.
    if (from) where.toDate = { gte: toUtcMidnight(from) };
    if (to) where.date = { lte: toUtcMidnight(to) };

    const [requests, total] = await Promise.all([
      prisma.wfhRequest.findMany({
        where,
        orderBy: { date: "asc" },
        skip,
        take,
      }),
      prisma.wfhRequest.count({ where }),
    ]);

    // Enrich with employee names.
    const uids = [...new Set((requests as any[]).map((r: any) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: uids as string[] } },
      select: {
        id: true,
        username: true,
        first_name: true,
        last_name: true,
        department: true,
      },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "WFH requests retrieved",
      data: (requests as any[]).map((r: any) => ({
        ...r,
        employee: uMap.get(r.userId),
      })),
      total,
    });
  } catch (error) {
    logger.error("GET /wfh/requests error:", { error });
    return handleError(res, error);
  }
}

/**
 * PATCH /wfh/requests/status
 * Approve, reject, or cancel a WFH request.
 *
 * Approve/reject are delegated to the approval-engine (actOnApprovalForEntity)
 * — see the "wfh" MODULE_SIDE_EFFECTS callback in approvalChains.ts for what
 * happens once a decision is final (status update, AttendanceRecord upsert,
 * webhook).
 */
export async function updateWfhStatus(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { requestId, action, rejectionReason } = req.body as {
      requestId: string;
      action: "approve" | "reject" | "cancel";
      rejectionReason?: string;
    };

    const wfhReq = await prisma.wfhRequest.findUnique({
      where: { id: requestId },
    });
    if (!wfhReq) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "WFH request not found",
      });
    }
    if ((wfhReq as any).status !== "Pending") {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Cannot ${action} a request with status '${(wfhReq as any).status}'`,
      });
    }

    const tenantId = user?.tenantId;
    if (!tenantId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "No active tenant.",
      });
    }

    // Employees can only cancel their own requests.
    if (action === "cancel") {
      if ((wfhReq as any).userId !== user!.userId) {
        return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
          message: "You can only cancel your own WFH requests",
        });
      }
      await prisma.wfhRequest.update({
        where: { id: requestId },
        data: { status: "Cancelled" },
      });

      const instance = await (prisma as any).approvalInstance.findFirst({
        where: {
          tenantId,
          module: "wfh",
          entityId: requestId,
          status: "pending",
        },
      });
      if (instance) {
        await cancelApproval(instance.id).catch((err) =>
          logger.warn(
            "[updateWfhStatus] Failed to cancel pending approval instance:",
            { err },
          ),
        );
      }

      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "WFH request cancelled",
      });
    }

    const privileged = await isWfhPrivileged(user);
    try {
      const result = await actOnApprovalForEntity(
        tenantId,
        "wfh",
        requestId,
        user!.userId,
        action === "approve" ? "approved" : "rejected",
        rejectionReason,
        privileged,
      );
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: result.isFinal
          ? `WFH request ${result.finalStatus}`
          : "Approved — forwarded to the next approver.",
      });
    } catch (err: any) {
      if (err?.message && !err?.code) {
        return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
          message: err.message,
        });
      }
      throw err;
    }
  } catch (error) {
    logger.error("PATCH /wfh/requests/status error:", { error });
    return handleError(res, error);
  }
}

/**
 * GET /wfh/calendar
 * Monthly calendar view of WFH requests for the team (for manager dashboards).
 */
export async function getWfhCalendar(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { year, month } = req.query as Record<string, string>;
    const y = parseInt(year);
    const m = parseInt(month);
    if (!y || !m || m < 1 || m > 12) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Valid year and month (1-12) are required",
      });
    }

    const startDate = dayjs
      .utc(`${y}-${String(m).padStart(2, "0")}-01`)
      .startOf("month")
      .toDate();
    const endDate = dayjs.utc(startDate).endOf("month").toDate();

    const isApprover = await isWfhPrivileged(user);
    // Overlap with the month, not just requests that start within it — a
    // range spanning month-end still needs its in-month days to show up.
    const where: any = {
      date: { lte: endDate },
      toDate: { gte: startDate },
      status: "Approved",
    };
    if (!isApprover) where.userId = user!.userId;

    const requests = await prisma.wfhRequest.findMany({
      where,
      orderBy: { date: "asc" },
    });

    const uids = [...new Set((requests as any[]).map((r: any) => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: uids as string[] } },
      select: { id: true, username: true, first_name: true, last_name: true },
    });
    const uMap = new Map(users.map((u) => [u.id, u]));

    // Expand each request's range into one entry per day, clamped to the
    // requested month — the calendar UI groups entries by exact day.
    const entries: { date: Date; employee: unknown }[] = [];
    for (const r of requests as any[]) {
      const rangeStart = dayjs.utc(r.date).isAfter(startDate)
        ? r.date
        : startDate;
      const rangeEnd = dayjs.utc(r.toDate).isBefore(endDate)
        ? r.toDate
        : endDate;
      for (const d of eachDate(rangeStart, rangeEnd)) {
        entries.push({ date: d, employee: uMap.get(r.userId) });
      }
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "WFH calendar retrieved",
      data: entries,
    });
  } catch (error) {
    logger.error("GET /wfh/calendar error:", { error });
    return handleError(res, error);
  }
}
