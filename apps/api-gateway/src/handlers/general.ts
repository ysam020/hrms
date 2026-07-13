import { Request, Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { cacheManager } from "@hrms/cache";
import { handleError } from "../utils/handleError";
import { randomBytes } from "crypto";
import path from "path";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, S3_BUCKET, S3_REGION, s3FileUrl } from "../config/s3";
import { NOTIFICATION_PRUNE_LIMIT } from "../constants";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

// File validation

export const DANGEROUS_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".pif",
  ".scr",
  ".vbs",
  ".jar",
  ".ws",
  ".wsf",
  ".msi",
  ".app",
  ".deb",
  ".rpm",
  ".sh",
  ".ps1",
];
export const ALLOWED_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".xls",
  ".xlsx",
  ".csv",
  ".mp4",
  ".webm",
  ".mov",
];
export const ALLOWED_MIMETYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

export function sanitizePart(s: string | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  let v = s
    .trim()
    .replace(/\.\./g, "")
    .replace(/\\/g, "")
    .replace(/\//g, "_")
    .replace(/:/g, "")
    .replace(/[*?|]/g, "")
    .replace(/\0/g, "")
    .replace(/%00/gi, "")
    .replace(/%2e/gi, "")
    .replace(/%2f/gi, "")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .replace(/\s+/g, "_");
  v = v.replace(/[^a-zA-Z0-9._-]/g, "_");
  return v.length ? v.substring(0, 100) : null;
}

// Route handlers

export async function getHolidays(req: Request, res: Response) {
  try {
    const year = parseInt(String(req.params.year));
    if (isNaN(year)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid year",
        data: [],
      });
    }

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:holiday:${year}`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Holidays retrieved successfully",
        data: cached,
      });
    }

    const records = await prisma.holiday.findMany({ where: { year } });
    const data = records.flatMap((record: any) => {
      const list = Array.isArray(record.holidays)
        ? (record.holidays as any[])
        : [];
      return list.map((h: any) => ({
        name: h.name,
        date: h.date,
        createdBy: h.createdBy,
        createdOn: h.createdOn,
        month: record.month,
      }));
    });

    await cacheManager.set(cacheKey, data, "holiday");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Holidays retrieved successfully",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-holidays error:", { error });
    return handleError(res, error);
  }
}

export async function getCalendarEvents(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:calendar:events:${userId}`;

    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Calendar events retrieved successfully",
        data: cached,
      });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { events: true },
    });

    if (!dbUser) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
        data: [],
      });
    }

    const rawEvents = Array.isArray(dbUser.events)
      ? (dbUser.events as any[])
      : [];
    const data = rawEvents
      .map((e: any) => ({
        _id: typeof e._id === "string" ? e._id : e._id?.$oid || e.id || "",
        title: e.title,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        description: e.description,
      }))
      .sort(
        (a: any, b: any) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf(),
      );

    await cacheManager.set(cacheKey, data, "user");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Calendar events retrieved successfully",
      data,
    });
  } catch (error: unknown) {
    logger.error("get-calendar-events error:", { error });
    return handleError(res, error);
  }
}

export async function getBirthdaysAnniversaries(req: Request, res: Response) {
  try {
    const { month, year } = req.query;
    const monthNum = parseInt(month as string, 10);
    const yearNum = parseInt(year as string, 10);

    if (!monthNum || !yearNum) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "month and year query params are required",
        data: [],
      });
    }

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:dashboard:birthdays:${monthNum}:${yearNum}`;
    const cached = await cacheManager.get<any[]>(cacheKey);
    if (cached) {
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        message: "Birthdays and anniversaries retrieved successfully",
        data: cached,
      });
    }

    const employees = await prisma.user.findMany({
      where: { employeeStatus: { not: "Terminated" } },
      select: {
        first_name: true,
        last_name: true,
        username: true,
        dob: true,
        joining_date: true,
        department: true,
      },
    });

    const data: any[] = [];

    for (const emp of employees) {
      const fullName =
        `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || emp.username;

      if (emp.dob) {
        const dob = dayjs.utc(emp.dob);
        if (dob.isValid() && dob.month() + 1 === monthNum) {
          data.push({
            type: "birthday",
            name: fullName,
            username: emp.username,
            department: emp.department || "",
            day: dob.date(),
          });
        }
      }

      if (emp.joining_date) {
        const joining = dayjs.utc(emp.joining_date);
        if (joining.isValid() && joining.month() + 1 === monthNum) {
          const years = yearNum - joining.year();
          if (years > 0) {
            data.push({
              type: "anniversary",
              name: fullName,
              username: emp.username,
              department: emp.department || "",
              day: joining.date(),
              years,
            });
          }
        }
      }
    }

    data.sort((a, b) => a.day - b.day);
    await cacheManager.set(cacheKey, data, "dashboard");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Birthdays and anniversaries retrieved successfully",
      data,
    });
  } catch (error: unknown) {
    logger.error("birthdays-anniversaries error:", { error });
    return handleError(res, error);
  }
}

export async function getAuditLogs(req: Request, res: Response) {
  try {
    const {
      days = "30",
      entityType = "",
      userName = "",
    } = req.query as Record<string, string>;
    const daysNum = parseInt(days) || 1;
    const pastDate = dayjs().subtract(daysNum, "day").toDate();

    const where: any = { timestamp: { gte: pastDate } };
    if (entityType) where.entityType = entityType;
    // username is denormalized onto the log row at write time, so this
    // still finds a user's history even if they're later renamed or removed.
    if (userName) where.username = userName;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: NOTIFICATION_PRUNE_LIMIT,
    });

    const data = logs.map((l: any) => ({
      _id: l.id,
      action: l.action,
      entityType: l.entityType,
      username: l.username,
      description: l.description,
      ipAddress: l.ipAddress,
      userAgent: l.userAgent,
      timestamp: l.timestamp,
      oldValue: l.oldValue,
      newValue: l.newValue,
    }));

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Audit logs retrieved successfully",
      data,
    });
  } catch (error: unknown) {
    logger.error("audit-logs error:", { error });
    return handleError(res, error);
  }
}

export async function addHoliday(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const { name, date } = req.body;
    if (!name || !date)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Name and date are required",
      });

    const d = dayjs(date);
    if (!d.isValid())
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid date format",
      });

    const year = d.year();
    const month = d.month() + 1;
    const formattedDate = d.format("YYYY-MM-DD");

    const existing = await prisma.holiday.findFirst({ where: { year, month } });
    const username = user?.userId || "system";

    if (existing) {
      const list = Array.isArray(existing.holidays)
        ? (existing.holidays as any[])
        : [];
      if (list.some((h: any) => h.date === formattedDate)) {
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: "Holiday already exists for this date",
        });
      }
      list.push({
        name,
        date: formattedDate,
        createdBy: username,
        createdOn: new Date().toISOString(),
      });
      await prisma.holiday.update({
        where: { id: existing.id },
        data: { holidays: list },
      });
    } else {
      await prisma.holiday.create({
        data: {
          tenantId: user!.tenantId!,
          year,
          month,
          holidays: [
            {
              name,
              date: formattedDate,
              createdBy: username,
              createdOn: new Date().toISOString(),
            },
          ],
        },
      });
    }

    await cacheManager.delete(`t:${getTenantId() ?? "global"}:holiday:${year}`);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Holiday added successfully",
    });
  } catch (error: unknown) {
    logger.error("add-holiday error:", { error });
    return handleError(res, error);
  }
}

export async function deleteHoliday(req: Request, res: Response) {
  try {
    const { date } = req.body;
    if (!date)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Date is required",
      });

    const d = dayjs(date);
    if (!d.isValid())
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid date format",
      });

    const year = d.year();
    const month = d.month() + 1;
    const formattedDate = d.format("YYYY-MM-DD");

    const record = await prisma.holiday.findFirst({ where: { year, month } });
    if (!record)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Holiday not found",
      });

    const list = Array.isArray(record.holidays)
      ? (record.holidays as any[])
      : [];
    const newList = list.filter((h: any) => h.date !== formattedDate);
    if (newList.length === list.length)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Holiday not found for this date",
      });

    await prisma.holiday.update({
      where: { id: record.id },
      data: { holidays: newList },
    });
    await cacheManager.delete(`t:${getTenantId() ?? "global"}:holiday:${year}`);
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Holiday deleted successfully",
    });
  } catch (error: unknown) {
    logger.error("delete-holiday error:", { error });
    return handleError(res, error);
  }
}

export async function addEvent(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { events: true },
    });
    if (!dbUser)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const events = Array.isArray(dbUser.events) ? (dbUser.events as any[]) : [];
    const { title, date, startTime, endTime, description } = req.body;
    const newEvent = {
      _id: randomBytes(12).toString("hex"),
      title: String(title || "").substring(0, 200),
      date: date || "",
      startTime: startTime || "",
      endTime: endTime || "",
      description: String(description || "").substring(0, 1000),
    };
    events.push(newEvent);
    await prisma.user.update({ where: { id: userId }, data: { events } });
    await cacheManager.delete(
      `t:${getTenantId() ?? "global"}:calendar:events:${userId}`,
    );
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      message: "Event added successfully",
      data: newEvent,
    });
  } catch (error: unknown) {
    logger.error("add-event error:", { error });
    return handleError(res, error);
  }
}

export async function editCalendarEvent(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const eventId = req.params._id;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { events: true },
    });
    if (!dbUser)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const events = Array.isArray(dbUser.events) ? (dbUser.events as any[]) : [];
    const idx = events.findIndex((e: any) => {
      const id = typeof e._id === "string" ? e._id : e._id?.$oid || "";
      return id === eventId;
    });
    if (idx === -1)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Event not found",
      });

    const { title, date, startTime, endTime, description } = req.body;
    events[idx] = {
      ...events[idx],
      title:
        title !== undefined
          ? String(title).substring(0, 200)
          : events[idx].title,
      date: date !== undefined ? date : events[idx].date,
      startTime: startTime !== undefined ? startTime : events[idx].startTime,
      endTime: endTime !== undefined ? endTime : events[idx].endTime,
      description:
        description !== undefined
          ? String(description).substring(0, 1000)
          : events[idx].description,
      _id: events[idx]._id,
    };
    await prisma.user.update({ where: { id: userId }, data: { events } });
    await cacheManager.delete(
      `t:${getTenantId() ?? "global"}:calendar:events:${userId}`,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Event updated successfully",
      data: events[idx],
    });
  } catch (error: unknown) {
    logger.error("edit-calendar-event error:", { error });
    return handleError(res, error);
  }
}

export async function deleteCalendarEvent(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const userId = user!.userId;
    const eventId = req.params._id;
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { events: true },
    });
    if (!dbUser)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "User not found",
      });

    const events = Array.isArray(dbUser.events) ? (dbUser.events as any[]) : [];
    const newEvents = events.filter((e: any) => {
      const id = typeof e._id === "string" ? e._id : e._id?.$oid || "";
      return id !== eventId;
    });
    if (newEvents.length === events.length)
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Event not found",
      });

    await prisma.user.update({
      where: { id: userId },
      data: { events: newEvents },
    });
    await cacheManager.delete(
      `t:${getTenantId() ?? "global"}:calendar:events:${userId}`,
    );
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Event deleted successfully",
    });
  } catch (error: unknown) {
    logger.error("delete-calendar-event error:", { error });
    return handleError(res, error);
  }
}

export async function getPresignedUrl(req: Request, res: Response) {
  try {
    const { fileName, fileType, folder, username, formikField } = req.body;

    if (!fileName || !fileType || !folder || !username) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "fileName, fileType, folder and username are required",
      });
    }

    const ext = path.extname(fileName).toLowerCase();
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: `Dangerous file type: ${ext}`,
      });
    }
    if (
      !ALLOWED_EXTENSIONS.includes(ext) ||
      !ALLOWED_MIMETYPES.includes(fileType)
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "File type not allowed",
      });
    }

    const safeFolder = sanitizePart(folder);
    const safeUser = sanitizePart(username);
    const safeField = sanitizePart(formikField);
    const safeBase = sanitizePart(path.basename(fileName, ext));

    if (!safeFolder || !safeUser || !safeBase) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "Invalid file path components",
      });
    }

    const uniqueName = `${safeBase}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const key = safeField
      ? `${safeFolder}/${safeField}/${safeUser}/${uniqueName}`
      : `${safeFolder}/${safeUser}/${uniqueName}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      ContentType: fileType,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pre-signed URL generated",
      data: { url, key, fileUrl: s3FileUrl(key) },
    });
  } catch (error: unknown) {
    logger.error("presigned-url error:", { error });
    return handleError(res, error);
  }
}

const S3_URL_PREFIX = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`;

/**
 * POST /upload/view-url
 * The bucket has no public read access (uploads include sensitive KYC
 * documents — aadhar, PAN, bank proofs), so the raw fileUrl saved on an
 * employee record 403s if loaded directly. Every preview/view goes through
 * here for a short-lived signed GET URL instead.
 */
export async function getFileViewUrl(req: AuthRequest, res: Response) {
  try {
    const { fileUrl } = req.body as { fileUrl?: string };
    if (
      !fileUrl ||
      typeof fileUrl !== "string" ||
      !fileUrl.startsWith(S3_URL_PREFIX)
    ) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: "A valid fileUrl is required",
      });
    }

    const key = decodeURIComponent(fileUrl.slice(S3_URL_PREFIX.length));
    // Restrict this endpoint to KYC uploads only, and reject any traversal
    // attempt — an unrestricted key would let any authenticated caller read
    // arbitrary objects in the bucket via a crafted fileUrl.
    if (!key.startsWith("employee_kyc/") || key.includes("..")) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Not allowed",
      });
    }

    // employee_kyc/{field}/{username}/{file} or employee_kyc/{username}/{file}
    const segments = key.split("/");
    const ownerUsername = segments.length >= 4 ? segments[2] : segments[1];

    const { userId, tenantRole } = req.user!;
    const caller = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, isSuperUser: true },
    });
    const isOwner = !!caller && caller.username === ownerUsername;
    const isPrivileged =
      caller?.isSuperUser ||
      ["owner", "admin", "hr"].includes(tenantRole ?? "");
    if (!isOwner && !isPrivileged) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "You don't have permission to view this file.",
      });
    }

    const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Pre-signed view URL generated",
      data: { url },
    });
  } catch (error: unknown) {
    logger.error("file-view-url error:", { error });
    return handleError(res, error);
  }
}
