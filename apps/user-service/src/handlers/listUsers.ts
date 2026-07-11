import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant, getTenantId } from "@hrms/db";
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

    const tenantId = getTenantId() ?? "global";
    // v2: the mapped response was missing educationCertificates entirely —
    // a `repeated string` field on the User proto message, which throws
    // ("... is not iterable") during response serialization when it's
    // undefined rather than an (empty) array. Versioning the key so any
    // already-cached broken response isn't replayed post-fix.
    const cacheKey = `t:${tenantId}:users:v2:${search}:${role}:${department}:p${page}:l${limit}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: any = {};
    if (search)
      where.OR = [
        { first_name: { contains: search, mode: "insensitive" } },
        { last_name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { username: { contains: search, mode: "insensitive" } },
      ];
    if (role) where.role = { has: role };
    if (department) where.department = department;

    const [users, total] = await Promise.all([
      prismaWithTenant.user.findMany({
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
      prismaWithTenant.user.count({ where }),
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
        educationCertificates: [] as string[],
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
    await cacheManager.set(cacheKey, response, "user");
    // Also register under a pattern so the whole tenant's user cache can be
    // invalidated with cacheManager.invalidatePattern(`t:${tenantId}:users:*`)
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
