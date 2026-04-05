import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

const isObjectId = (v: string) => /^[0-9a-f]{24}$/i.test(v);

export const getAttendance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, startDate, endDate, page = 1, limit = 31 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 31;
    const skip = (pageNum - 1) * limitNum;

    // Resolve username from userId (ObjectId) or use directly as username
    let username: string | undefined;
    if (userId) {
      if (isObjectId(userId)) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { username: true },
        });
        username = user?.username;
      } else {
        username = userId;
      }
    }

    const cacheKey = `attendance:${username || ""}:${startDate || ""}:${endDate || ""}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: Record<string, any> = {};
    if (username) where.username = username;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    const data = records.map((r) => ({
      id: r.id,
      userId: r.username,
      date: r.date ? r.date.toISOString() : "",
      checkIn: r.timeIn || "",
      checkOut: r.timeOut || "",
      status: r.status || "",
      latitude: 0,
      longitude: 0,
      workHours: r.workingHours != null ? String(r.workingHours) : "",
    }));

    const response = {
      message: MESSAGES.ATTENDANCE_RECORDS_FETCHED,
      status: status.OK,
      data,
      total,
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
