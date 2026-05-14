import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

// Returns every calendar date between start and end (inclusive) as YYYY-MM-DD.
function eachDay(start: Date, end: Date): string[] {
  const days: string[] = [];
  const cur = new Date(start);
  cur.setUTCHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setUTCHours(0, 0, 0, 0);
  while (cur <= last) {
    days.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
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

    const cacheKey = `attendance:${userId || ""}:${startDate || ""}:${endDate || ""}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: Record<string, any> = {};
    if (userId) where.userId = userId;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
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
      if (r.date) byDate.set(r.date.toISOString().slice(0, 10), r);
    }

    const todayKey = new Date().toISOString().slice(0, 10);

    type AttendanceRow = {
      date: string;
      checkIn: string;
      checkOut: string;
      status: string;
      workHours: string;
    };
    let data: AttendanceRow[];

    if (userId && startDate && endDate) {
      const allDays = eachDay(new Date(startDate), new Date(endDate));

      data = allDays
        .map((dateKey) => {
          const r = byDate.get(dateKey);
          if (r) {
            return {
              date: r.date!.toISOString(),
              checkIn: r.timeIn || "",
              checkOut: r.timeOut || "",
              status: r.status || "",
              workHours: r.workingHours != null ? String(r.workingHours) : "",
            };
          }
          if (dateKey >= todayKey) return null;
          return {
            date: new Date(dateKey).toISOString(),
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
        checkIn: r.timeIn || "",
        checkOut: r.timeOut || "",
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
