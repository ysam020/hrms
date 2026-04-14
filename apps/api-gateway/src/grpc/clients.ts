import { credentials } from "@grpc/grpc-js";
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

const creds = credentials.createInsecure();

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

// Promisify a unary gRPC call
export const grpcCall = <Req, Res>(
  client: any,
  method: string,
  request: Req,
): Promise<Res> =>
  new Promise((resolve, reject) => {
    client[method](request, (error: any, response: Res) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
