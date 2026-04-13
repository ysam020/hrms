import { credentials, status as GrpcStatus } from "@grpc/grpc-js";
import fs from "fs";
import { CircuitBreaker, CircuitOpenError, breakers } from "./circuitBreaker";
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
import { logger } from "@hrms/logger";

function buildClientCredentials() {
  const tlsEnabled = process.env.GRPC_TLS_ENABLED === "true";
  if (!tlsEnabled) {
    if (process.env.NODE_ENV === "production") {
      logger.warn(
        "gRPC clients are connecting WITHOUT TLS in production. Set GRPC_TLS_ENABLED=true with GRPC_CA_CERT.",
      );
    }
    return credentials.createInsecure();
  }

  const caPath = process.env.GRPC_CA_CERT;
  const clientCertPath = process.env.GRPC_CLIENT_CERT;
  const clientKeyPath = process.env.GRPC_CLIENT_KEY;

  if (!caPath) {
    throw new Error("GRPC_TLS_ENABLED is true but GRPC_CA_CERT is not set");
  }

  const rootCerts = fs.readFileSync(caPath);
  // mTLS: include client cert/key when the server requires client auth
  const clientCert =
    clientCertPath && clientKeyPath
      ? {
          cert: fs.readFileSync(clientCertPath),
          privateKey: fs.readFileSync(clientKeyPath),
        }
      : null;

  return credentials.createSsl(
    rootCerts,
    clientCert?.privateKey ?? null,
    clientCert?.cert ?? null,
  );
}

const creds = buildClientCredentials();

// Keep channel options in sync with the server-side limits in base-server.ts.
const channelOptions = {
  "grpc.max_receive_message_length": 4 * 1024 * 1024,
  "grpc.max_send_message_length": 4 * 1024 * 1024,
  "grpc.keepalive_time_ms": 30_000,
  "grpc.keepalive_timeout_ms": 10_000,
  "grpc.keepalive_permit_without_calls": 1,
};

const addr = (
  host: string | undefined,
  port: string | undefined,
  defaultPort: number,
) => `${host || "localhost"}:${port || defaultPort}`;

export const authClient = new auth.AuthServiceClient(
  addr(process.env.AUTH_SERVICE_HOST, process.env.AUTH_SERVICE_PORT, 50051),
  creds,
  channelOptions,
);
export const userClient = new user.UserServiceClient(
  addr(process.env.USER_SERVICE_HOST, process.env.USER_SERVICE_PORT, 50052),
  creds,
  channelOptions,
);
export const employeeClient = new employee.EmployeeServiceClient(
  addr(
    process.env.EMPLOYEE_SERVICE_HOST,
    process.env.EMPLOYEE_SERVICE_PORT,
    50053,
  ),
  creds,
  channelOptions,
);
export const attendanceClient = new attendance.AttendanceServiceClient(
  addr(
    process.env.ATTENDANCE_SERVICE_HOST,
    process.env.ATTENDANCE_SERVICE_PORT,
    50054,
  ),
  creds,
  channelOptions,
);
export const leaveClient = new leave.LeaveServiceClient(
  addr(process.env.LEAVE_SERVICE_HOST, process.env.LEAVE_SERVICE_PORT, 50055),
  creds,
  channelOptions,
);
export const recruitmentClient = new recruitment.RecruitmentServiceClient(
  addr(
    process.env.RECRUITMENT_SERVICE_HOST,
    process.env.RECRUITMENT_SERVICE_PORT,
    50056,
  ),
  creds,
  channelOptions,
);
export const hrmClient = new hrm.HrmServiceClient(
  addr(process.env.HRM_SERVICE_HOST, process.env.HRM_SERVICE_PORT, 50057),
  creds,
  channelOptions,
);
export const salaryClient = new salary.SalaryServiceClient(
  addr(process.env.SALARY_SERVICE_HOST, process.env.SALARY_SERVICE_PORT, 50058),
  creds,
  channelOptions,
);
export const analyticsClient = new analytics.AnalyticsServiceClient(
  addr(
    process.env.ANALYTICS_SERVICE_HOST,
    process.env.ANALYTICS_SERVICE_PORT,
    50059,
  ),
  creds,
  channelOptions,
);
export const notificationClient = new notification.NotificationServiceClient(
  addr(
    process.env.NOTIFICATION_SERVICE_HOST,
    process.env.NOTIFICATION_SERVICE_PORT,
    50060,
  ),
  creds,
  channelOptions,
);

// How long (ms) to wait for a gRPC response before giving up.
// Override with GRPC_DEADLINE_MS in .env. Default: 10 000 ms.
const GRPC_DEADLINE_MS = Number(process.env.GRPC_DEADLINE_MS) || 10_000;

/**
 * Promisify a unary gRPC call with an absolute deadline.
 * A missing or slow downstream service will never hold an HTTP connection
 * open indefinitely — the call is cancelled after GRPC_DEADLINE_MS.
 */
export const grpcCall = <Req, Res>(
  client: any,
  method: string,
  request: Req,
): Promise<Res> =>
  new Promise((resolve, reject) => {
    const deadline = new Date(Date.now() + GRPC_DEADLINE_MS);
    client[method](request, { deadline }, (error: any, response: Res) => {
      if (error) reject(error);
      else resolve(response);
    });
  });

/**
 * Like `grpcCall` but wrapped with a circuit breaker.
 * `CircuitOpenError` is converted to a gRPC UNAVAILABLE error so callers
 * don't need special-case logic — `grpcToHttpStatus(UNAVAILABLE)` returns 503.
 */
export const grpcCallWithBreaker = <Req, Res>(
  breaker: CircuitBreaker,
  client: any,
  method: string,
  request: Req,
): Promise<Res> =>
  breaker
    .call(() => grpcCall<Req, Res>(client, method, request))
    .catch((err) => {
      if (err instanceof CircuitOpenError) {
        throw Object.assign(new Error(err.message), {
          code: GrpcStatus.UNAVAILABLE,
        });
      }
      throw err;
    });

// ─── Per-service named call wrappers ─────────────────────────────────────────
// Handlers import these instead of (grpcCall + client) so the circuit breaker
// is baked in automatically and cannot be accidentally bypassed.

export const authCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(breakers.auth, authClient, method, request);

export const analyticsCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(
    breakers.analytics,
    analyticsClient,
    method,
    request,
  );

export const attendanceCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(
    breakers.attendance,
    attendanceClient,
    method,
    request,
  );

export const employeeCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(
    breakers.employee,
    employeeClient,
    method,
    request,
  );

export const hrmCall = <Req, Res>(method: string, request: Req): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(breakers.hrm, hrmClient, method, request);

export const leaveCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(breakers.leave, leaveClient, method, request);

export const notificationCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(
    breakers.notification,
    notificationClient,
    method,
    request,
  );

export const recruitmentCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(
    breakers.recruitment,
    recruitmentClient,
    method,
    request,
  );

export const salaryCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(breakers.salary, salaryClient, method, request);

export const userCall = <Req, Res>(
  method: string,
  request: Req,
): Promise<Res> =>
  grpcCallWithBreaker<Req, Res>(breakers.user, userClient, method, request);
