import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const getDashboardStats = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:analytics:dashboard`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const today = new Date();
    const todayStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );

    const [
      totalEmployees,
      presentToday,
      pendingLeaves,
      onLeave,
      openJobPositions,
    ] = await Promise.all([
      prisma.user.count({ where: { employeeStatus: "Active" } }),
      prisma.attendanceRecord.count({
        where: { date: todayStart, status: { in: ["Present", "Late"] } },
      }),
      prisma.leaveApplication.count({ where: { status: "Pending" } }),
      prisma.leaveApplication.count({
        where: {
          status: "Approved",
          from: { lte: today.toISOString().split("T")[0] },
          to: { gte: today.toISOString().split("T")[0] },
        },
      }),
      prisma.jobOpening.count({ where: { status: "Open" } }),
    ]);

    const presentRate =
      totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;

    const response = {
      message: MESSAGES.DASHBOARD_STATS_FETCHED,
      status: status.OK,
      totalEmployees,
      presentToday,
      onLeave,
      pendingApprovals: pendingLeaves,
      openJobPositions,
      avgAttendanceRate: Math.round(presentRate * 100) / 100,
    };
    await cacheManager.set(cacheKey, response, "dashboard");
    return callback(null, response);
  } catch (err) {
    logger.error("GetDashboardStats error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      totalEmployees: 0,
      presentToday: 0,
      onLeave: 0,
      pendingApprovals: 0,
      openJobPositions: 0,
      avgAttendanceRate: 0,
    });
  }
};
