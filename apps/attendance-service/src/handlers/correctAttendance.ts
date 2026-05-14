import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

function calcWorkingHours(timeIn: string, timeOut: string): number {
  const [inH, inM] = timeIn.split(":").map(Number);
  const [outH, outM] = timeOut.split(":").map(Number);
  const diffMinutes = outH * 60 + outM - (inH * 60 + inM);
  return Math.round((diffMinutes / 60) * 100) / 100;
}

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

    const targetDate = date ? new Date(date) : new Date();
    const dateStart = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
    );

    const existingRecord = await prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId, date: dateStart } },
    });

    const updateData: Record<string, any> = { isCorrected: true };
    if (correctedBy) updateData.correctedBy = correctedBy;
    if (timeIn) updateData.timeIn = timeIn;
    if (timeOut) updateData.timeOut = timeOut;

    const effectiveTimeIn = timeIn || existingRecord?.timeIn;
    const effectiveTimeOut = timeOut || existingRecord?.timeOut;

    if (effectiveTimeIn && effectiveTimeOut) {
      const hours = calcWorkingHours(effectiveTimeIn, effectiveTimeOut);
      updateData.workingHours = hours;
      updateData.status = hours < 4 ? "Half Day" : "Present";
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
          userId,
          date: dateStart,
          timeIn: timeIn || "",
          timeOut: timeOut || "",
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
        timeIn: record.timeIn || "",
        timeOut: record.timeOut || "",
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
