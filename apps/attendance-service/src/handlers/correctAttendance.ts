import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import {
  getAttendanceSettings,
  resolveShift,
  calcWorkingHours,
  getUnpaidBreakMinutes,
} from "../utils/attendanceSettings";

dayjs.extend(utc);

export const correctAttendance = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, date, timeIn, timeOut, correctedBy } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const targetDate = date ? dayjs(date) : dayjs();
    const dateStart = targetDate.utc().startOf("day").toDate();
    const tenantId = getTenantId();

    const existingRecord = await prisma.attendanceRecord.findFirst({
      where: { tenantId, userId, date: dateStart },
    });

    const dateStr = targetDate.format("YYYY-MM-DD");
    const parseTime = (t: string) => {
      // Accept full ISO strings or bare HH:MM / HH:MM:SS
      const d = dayjs(t.includes("T") ? t : `${dateStr}T${t}`);
      return d.isValid() ? d.toDate() : null;
    };

    const updateData: Record<string, any> = { isCorrected: true };
    if (correctedBy) updateData.correctedBy = correctedBy;
    if (timeIn) updateData.timeIn = parseTime(timeIn);
    if (timeOut) updateData.timeOut = parseTime(timeOut);

    const effectiveTimeIn = updateData.timeIn ?? existingRecord?.timeIn;
    const effectiveTimeOut = updateData.timeOut ?? existingRecord?.timeOut;

    if (effectiveTimeIn && effectiveTimeOut) {
      // Same half-day threshold resolution as check-in/check-out — a
      // correction must not disagree with the live punch flow on what
      // counts as a full vs. half day for this employee.
      const cfg = tenantId ? await getAttendanceSettings(tenantId) : null;
      const user = tenantId
        ? await prisma.user.findUnique({
            where: { id: userId },
            select: { shiftId: true },
          })
        : null;
      const shiftOverride =
        tenantId && user
          ? await resolveShift(tenantId, userId, (user as any)?.shiftId ?? null)
          : null;
      const effectiveHalfDayMinHours =
        shiftOverride?.halfDayMinHours ?? cfg?.halfDayMinHours ?? 4;

      const unpaidBreakMinutes = existingRecord
        ? await getUnpaidBreakMinutes(existingRecord.id, effectiveTimeOut)
        : 0;
      const hours = calcWorkingHours(
        effectiveTimeIn,
        effectiveTimeOut,
        unpaidBreakMinutes,
      );
      updateData.workingHours = hours;
      updateData.status = hours < effectiveHalfDayMinHours ? "Half Day" : "Present";
    }

    let record;
    if (existingRecord) {
      record = await prisma.attendanceRecord.update({
        where: { id: existingRecord.id },
        data: updateData,
      });
    } else {
      record = await prisma.attendanceRecord.create({
        data: {
          tenantId: getTenantId()!,
          userId,
          date: dateStart,
          timeIn: updateData.timeIn ?? null,
          timeOut: updateData.timeOut ?? null,
          isCorrected: true,
          correctedBy: correctedBy || null,
          workingHours: updateData.workingHours,
          status: updateData.status || "Present",
        },
      });
    }

    await Promise.all([
      cacheManager.invalidatePattern(`attendance:${userId}:*`),
      cacheManager.delete(`todayAttendance:${userId}`),
      cacheManager.invalidatePattern(`attendanceSummary:${userId}:*`),
    ]);
    return callback(null, {
      message: MESSAGES.ATTENDANCE_CORRECTED,
      status: status.OK,
      data: {
        id: record.id,
        userId: record.userId,
        date: record.date?.toISOString() || "",
        timeIn: record.timeIn?.toISOString() || "",
        timeOut: record.timeOut?.toISOString() || "",
        status: record.status || "",
        workingHours: record.workingHours ?? 0,
      },
    });
  } catch (err) {
    logger.error("CorrectAttendance error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_ERROR,
      status: status.INTERNAL,
    });
  }
};
