/**
 * WFH Request Flow handler – gateway-direct.
 *
 * This closes the gap where `User.wfh` was a static boolean toggled by HR.
 * Now employees submit daily WFH requests; managers approve/reject.
 *
 * Attendance integration:
 *  – reconcileAttendance reads WfhRequest.status === "Approved" before
 *    marking an employee Absent (see scheduler job update).
 *  – An approved WFH day is recorded as status="WFH" in AttendanceRecord.
 *
 * Security:
 *  – Employees can only request for themselves.
 *  – Only managers, HR, admin, owner can approve/reject.
 *  – Past dates cannot be requested (prevents gaming).
 *  – Same day can only have one request (@@unique enforced at DB).
 */

import { Request, Response } from "express";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { handleError } from "../utils/handleError";
import { AuthRequest } from "../middleware/authenticate";
import { parsePagination } from "../utils/pagination";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { emitWebhookEvent } from "../utils/webhookEmitter";

dayjs.extend(utc);

async function assertApproverRole(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, isSuperUser: true },
  });
  if (!user) return false;
  if (user.isSuperUser) return true;
  return user.role.some((r) => ["owner", "admin", "hr", "manager"].includes(r));
}

function toUtcMidnight(dateStr: string): Date {
  return dayjs.utc(dateStr).startOf("day").toDate();
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /wfh/requests
 * Employee submits a WFH request for a specific date.
 */
export async function requestWfh(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { date, reason } = req.body as { date: string; reason?: string };

    const requestedDate = toUtcMidnight(date);
    const today = dayjs.utc().startOf("day");

    // Reject past dates (allow same-day only if before work-start).
    if (dayjs.utc(requestedDate).isBefore(today)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Cannot request WFH for a past date",
      });
    }

    // Reject weekends (simple check — org settings could refine this).
    const dow = dayjs.utc(requestedDate).day(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "WFH requests are only for weekdays",
      });
    }

    // Check for an existing leave application on that day to prevent conflicts.
    const existingLeave = await prisma.leaveApplication.findFirst({
      where: {
        userId: user!.userId,
        from: { lte: requestedDate },
        to: { gte: requestedDate },
        status: { in: ["Pending", "Approved"] },
      },
    });
    if (existingLeave) {
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "You already have a leave application for this date",
      });
    }

    const wfhReq = await prisma.wfhRequest.create({
      data: {
        tenantId: getTenantId() ?? undefined,
        userId: user!.userId,
        date: requestedDate,
        reason: reason ?? null,
        status: "Pending",
      },
    });

    logger.info(`WFH request created: ${wfhReq.id} for ${date}`, {
      userId: user!.userId,
    });

    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "WFH request submitted",
      data: { requestId: wfhReq.id, date, status: "Pending" },
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
    const isApprover = await assertApproverRole(user!.userId);
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
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = toUtcMidnight(from);
      if (to) where.date.lte = toUtcMidnight(to);
    }

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
 * On approval: upserts an AttendanceRecord with status="WFH" for that day.
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
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "WFH request cancelled",
      });
    }

    // Approve/reject requires approver role.
    if (!(await assertApproverRole(user!.userId))) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message:
          "Only managers, HR, admin, or owner can approve/reject WFH requests",
      });
    }

    if (action === "approve") {
      // Sequential writes — MongoDB standalone has no multi-doc transactions.
      await prisma.wfhRequest.update({
        where: { id: requestId },
        data: {
          status: "Approved",
          approvedBy: user!.userId,
          approvedAt: new Date(),
        },
      });

      // Upsert attendance record so the reconcile job won't mark the day Absent.
      await prisma.attendanceRecord.upsert({
        where: {
          tenantId_userId_date: {
            tenantId: getTenantId()!,
            userId: (wfhReq as any).userId,
            date: (wfhReq as any).date,
          },
        },
        create: {
          tenantId: getTenantId() ?? undefined,
          userId: (wfhReq as any).userId,
          date: (wfhReq as any).date,
          status: "WFH",
        },
        update: { status: "WFH" },
      });

      await emitWebhookEvent("wfh.approved", {
        requestId,
        userId: (wfhReq as any).userId,
        date: (wfhReq as any).date,
      });
    } else {
      await prisma.wfhRequest.update({
        where: { id: requestId },
        data: {
          status: "Rejected",
          rejectionReason: rejectionReason ?? null,
        },
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: `WFH request ${action}d`,
    });
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

    const isApprover = await assertApproverRole(user!.userId);
    const where: any = {
      date: { gte: startDate, lte: endDate },
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

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "WFH calendar retrieved",
      data: (requests as any[]).map((r: any) => ({
        date: r.date,
        employee: uMap.get(r.userId),
      })),
    });
  } catch (error) {
    logger.error("GET /wfh/calendar error:", { error });
    return handleError(res, error);
  }
}
