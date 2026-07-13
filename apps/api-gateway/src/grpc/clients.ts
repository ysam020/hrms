import {
  credentials,
  ChannelCredentials,
  status as GrpcStatus,
  ServiceError,
} from "@grpc/grpc-js";
import fs from "fs";
import path from "path";
import { grpcToHttpStatus } from "@hrms/common";
import {
  auth,
  user,
  employee,
  attendance,
  leave,
  hrm,
  salary,
  recruitment,
  notification,
  analytics,
} from "@hrms/proto";

function buildClientCredentials(): ChannelCredentials {
  const caFile =
    process.env.GRPC_TLS_CA_FILE ??
    path.resolve(__dirname, "../../../../packages/certificates/rootCA.pem");

  const overrides =
    process.env.GRPC_SKIP_HOSTNAME_VERIFICATION === "true"
      ? // Internal Docker hostnames (auth-service, etc.) won't match the cert CN
        // issued for localhost. Only skip when explicitly opted-in via env var.
        { checkServerIdentity: () => undefined }
      : undefined;

  return credentials.createSsl(fs.readFileSync(caFile), null, null, overrides);
}

const creds = buildClientCredentials();

const addr = (
  host: string | undefined,
  port: string | undefined,
  defaultPort: number,
) => `${host || "localhost"}:${port || defaultPort}`;

export const authClient = new auth.AuthServiceClient(
  addr(process.env.AUTH_SERVICE_HOST, process.env.AUTH_SERVICE_PORT, 50051),
  creds,
);
export const userClient = new user.UserServiceClient(
  addr(process.env.USER_SERVICE_HOST, process.env.USER_SERVICE_PORT, 50052),
  creds,
);
export const employeeClient = new employee.EmployeeServiceClient(
  addr(
    process.env.EMPLOYEE_SERVICE_HOST,
    process.env.EMPLOYEE_SERVICE_PORT,
    50053,
  ),
  creds,
);
export const attendanceClient = new attendance.AttendanceServiceClient(
  addr(
    process.env.ATTENDANCE_SERVICE_HOST,
    process.env.ATTENDANCE_SERVICE_PORT,
    50054,
  ),
  creds,
);
export const leaveClient = new leave.LeaveServiceClient(
  addr(process.env.LEAVE_SERVICE_HOST, process.env.LEAVE_SERVICE_PORT, 50055),
  creds,
);
export const recruitmentClient = new recruitment.RecruitmentServiceClient(
  addr(
    process.env.RECRUITMENT_SERVICE_HOST,
    process.env.RECRUITMENT_SERVICE_PORT,
    50056,
  ),
  creds,
);
export const hrmClient = new hrm.HrmServiceClient(
  addr(process.env.HRM_SERVICE_HOST, process.env.HRM_SERVICE_PORT, 50057),
  creds,
);
export const salaryClient = new salary.SalaryServiceClient(
  addr(process.env.SALARY_SERVICE_HOST, process.env.SALARY_SERVICE_PORT, 50058),
  creds,
);
export const analyticsClient = new analytics.AnalyticsServiceClient(
  addr(
    process.env.ANALYTICS_SERVICE_HOST,
    process.env.ANALYTICS_SERVICE_PORT,
    50059,
  ),
  creds,
);
export const notificationClient = new notification.NotificationServiceClient(
  addr(
    process.env.NOTIFICATION_SERVICE_HOST,
    process.env.NOTIFICATION_SERVICE_PORT,
    50060,
  ),
  creds,
);

import { Metadata } from "@grpc/grpc-js";
import { gatewayTenantStorage } from "../middleware/tenantContext";

// Promisify a unary gRPC call; annotates rejected errors with httpStatus so
// handlers can return the correct HTTP code without inspecting gRPC internals.
// Automatically forwards the request-scoped tenantId as gRPC metadata so every
// handler gets tenant isolation for free without any per-call changes.
export const grpcCall = <Req, Res>(
  client: any,
  method: string,
  request: Req,
  // Explicit override — only needed in the auth flow (before tenant is known)
  tenantIdOverride?: string | null,
): Promise<Res> => {
  const meta = new Metadata();
  const store = gatewayTenantStorage.getStore();
  const tenantId = tenantIdOverride ?? store?.tenantId;
  const dbName = store?.dbName;
  if (tenantId) meta.add("x-tenant-id", tenantId);
  if (dbName) meta.add("x-tenant-db-name", dbName);

  // Forward who's making this call so a downstream service's own audit-log
  // writes (see packages/grpc-server/src/base-server.ts) can still attribute
  // a mutation to a person, even though it's happening in a different process
  // than the one that authenticated the request.
  const actor = store?.actor;
  if (actor?.userId) meta.add("x-actor-user-id", actor.userId);
  if (actor?.username) meta.add("x-actor-username", actor.username);
  if (actor?.ipAddress) meta.add("x-actor-ip", actor.ipAddress);
  if (actor?.userAgent) meta.add("x-actor-user-agent", actor.userAgent);

  return new Promise((resolve, reject) => {
    client[method](
      request,
      meta,
      (error: ServiceError | null, response: Res) => {
        if (error) {
          (error as ServiceError & { httpStatus: number }).httpStatus =
            grpcToHttpStatus(error.code ?? GrpcStatus.UNKNOWN);
          reject(error);
        } else {
          resolve(response);
        }
      },
    );
  });
};
