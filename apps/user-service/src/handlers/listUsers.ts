import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const listUsers = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      role = "",
      department = "",
    } = call.request;
    const skip = (page - 1) * limit;

    const cacheKey = `users:${search}:${role}:${department}:p${page}:l${limit}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: any = {};
    if (search)
      where.OR = [
        { first_name: { contains: search, mode: "insensitive" } },
        { last_name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    if (role) where.role = { has: role };
    if (department) where.department = department;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { first_name: "asc" },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          first_name: true,
          last_name: true,
          mobile: true,
          department: true,
          designation: true,
          employeeStatus: true,
          employee_photo: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    const response = {
      message: MESSAGES.USERS_FETCHED,
      status: status.OK,
      data: users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        username: u.username,
        role: (u.role ?? []).join(","),
        firstName: u.first_name ?? "",
        lastName: u.last_name ?? "",
        mobile: u.mobile ?? "",
        department: u.department ?? "",
        designation: u.designation ?? "",
        employeeStatus: u.employeeStatus ?? "",
        employeePhoto: u.employee_photo ?? "",
        createdAt: u.createdAt ? u.createdAt.toISOString() : "",
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
    await cacheManager.set(cacheKey, response, "user");
    return callback(null, response);
  } catch (err) {
    logger.error("ListUsers error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
      page: 1,
      totalPages: 0,
    });
  }
};
