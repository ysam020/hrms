import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { Prisma, prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const createEmployee = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      username,
      email,
      firstName,
      lastName,
      department,
      designation,
      joiningDate,
      mobile,
    } = call.request;

    if (!username) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_USERNAME_EXISTS,
        status: status.ALREADY_EXISTS,
      });
    }

    const newUser = await prisma.user.create({
      data: {
        username,
        email: email || null,
        first_name: firstName || null,
        last_name: lastName || null,
        department: department || null,
        designation: designation || null,
        joining_date: joiningDate || null,
        mobile: mobile || null,
        role: { set: ["employee"] },
        employeeStatus: "Active",
      },
    });

    return callback(null, {
      message: MESSAGES.EMPLOYEE_CREATED,
      status: status.OK,
      data: newUser,
    });
  } catch (err) {
    // username/email are globally unique across tenants, but the pre-check
    // above only queries within the caller's own tenant (via
    // masterScopedPrisma) — so a same-username collision in a *different*
    // tenant, or a same-tenant race between two concurrent creates, only
    // surfaces here as a DB-level unique-constraint violation.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return callback(null, {
        message: MESSAGES.EMPLOYEE_USERNAME_EXISTS,
        status: status.ALREADY_EXISTS,
      });
    }
    logger.error("CreateEmployee error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
