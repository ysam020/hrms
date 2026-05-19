import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

function eachDay(start: string, end: string): string[] {
  const days: string[] = [];
  let cur = dayjs.utc(start).startOf("day");
  const last = dayjs.utc(end).startOf("day");
  while (!cur.isAfter(last)) {
    days.push(cur.format("YYYY-MM-DD"));
    cur = cur.add(1, "day");
  }
  return days;
}

export const getAttendance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, startDate, endDate, page = 1, limit = 31 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 31;
    const skip = (pageNum - 1) * limitNum;

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:attendance:${userId || ""}:${startDate || ""}:${endDate || ""}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: Record<string, any> = {};
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate)
        where.date.gte = dayjs.utc(startDate).startOf("day").toDate();
      if (endDate) where.date.lte = dayjs.utc(endDate).endOf("day").toDate();
    }

    const [records, dbTotal] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        orderBy: { date: "asc" },
        skip,
        take: limitNum,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    const byDate = new Map<string, (typeof records)[0]>();
    for (const r of records) {
      if (r.date) byDate.set(dayjs.utc(r.date).format("YYYY-MM-DD"), r);
    }

    const todayKey = dayjs.utc().format("YYYY-MM-DD");

    type AttendanceRow = {
      date: string;
      checkIn: string;
      checkOut: string;
      status: string;
      workHours: string;
    };
    let data: AttendanceRow[];

    if (userId && startDate && endDate) {
      const allDays = eachDay(startDate, endDate);

      data = allDays
        .map((dateKey) => {
          const r = byDate.get(dateKey);
          if (r) {
            return {
              date: r.date!.toISOString(),
              checkIn: r.timeIn?.toISOString() || "",
              checkOut: r.timeOut?.toISOString() || "",
              status: r.status || "",
              workHours: r.workingHours != null ? String(r.workingHours) : "",
            };
          }
          if (dateKey >= todayKey) return null;
          return {
            date: dayjs.utc(dateKey).toISOString(),
            checkIn: "",
            checkOut: "",
            status: "Leave",
            workHours: "",
          };
        })
        .filter((x): x is AttendanceRow => x !== null);
    } else {
      data = records.map((r) => ({
        date: r.date ? r.date.toISOString() : "",
        checkIn: r.timeIn?.toISOString() || "",
        checkOut: r.timeOut?.toISOString() || "",
        status: r.status || "",
        workHours: r.workingHours != null ? String(r.workingHours) : "",
      }));
    }

    const response = {
      message: MESSAGES.ATTENDANCE_RECORDS_FETCHED,
      status: status.OK,
      data,
      total: userId && startDate && endDate ? data.length : dbTotal,
    };
    await cacheManager.set(cacheKey, response, "attendance");
    return callback(null, response);
  } catch (err) {
    logger.error("GetAttendance error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
