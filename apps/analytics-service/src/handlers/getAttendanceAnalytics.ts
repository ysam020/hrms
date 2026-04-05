import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getAttendanceAnalytics = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { startDate, endDate } = call.request;

    const cacheKey = `analytics:attendance:${startDate || ""}:${endDate || ""}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: any = {};
    if (startDate) where.date = { gte: new Date(startDate) };
    if (endDate) where.date = { ...where.date, lte: new Date(endDate) };

    const records = await prisma.attendanceRecord.findMany({
      where,
      select: { date: true, status: true },
      orderBy: { date: "asc" },
    });

    // Group by date string
    const byDate: Record<
      string,
      { present: number; absent: number; late: number }
    > = {};
    for (const r of records) {
      const key = r.date.toISOString().split("T")[0];
      if (!byDate[key]) byDate[key] = { present: 0, absent: 0, late: 0 };
      const s = (r.status ?? "").toLowerCase();
      if (s === "present") byDate[key].present++;
      else if (s === "absent") byDate[key].absent++;
      else if (s === "late") byDate[key].late++;
    }

    const data = Object.entries(byDate).map(([date, counts]) => ({
      label: date,
      value: counts.present,
      date,
    }));

    const response = {
      message: MESSAGES.ATTENDANCE_ANALYTICS_FETCHED,
      status: status.OK,
      data,
      total: records.length,
    };
    await cacheManager.set(cacheKey, response, "analytics");
    return callback(null, response);
  } catch (err) {
    logger.error("GetAttendanceAnalytics error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
