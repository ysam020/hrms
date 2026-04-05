export const responseMessage = {
  AUTH: {
    LOGIN_SUCCESS: "Login successful",
    LOGOUT_SUCCESS: "Logout successful",
    TOKEN_REFRESHED: "Token refreshed",
    PROFILE_FETCHED: "Profile fetched",
  },
  USER: {
    CREATED: "User created successfully",
    UPDATED: "User updated successfully",
    DELETED: "User deleted successfully",
    FETCHED: "User fetched successfully",
    LIST_FETCHED: "Users fetched successfully",
    FCM_REGISTERED: "FCM token registered",
  },
  EMPLOYEE: {
    CREATED: "Employee created successfully",
    UPDATED: "Employee updated successfully",
    DELETED: "Employee deleted successfully",
    FETCHED: "Employee fetched successfully",
    LIST_FETCHED: "Employees fetched successfully",
  },
  ATTENDANCE: {
    MARKED: "Attendance marked successfully",
    FETCHED: "Attendance records fetched",
    SUMMARY_FETCHED: "Attendance summary fetched",
  },
  LEAVE: {
    APPLIED: "Leave applied successfully",
    APPROVED: "Leave approved",
    REJECTED: "Leave rejected",
    CANCELLED: "Leave cancelled",
    FETCHED: "Leave records fetched",
    BALANCE_FETCHED: "Leave balance fetched",
  },
  RECRUITMENT: {
    JOB_CREATED: "Job opening created",
    JOB_UPDATED: "Job opening updated",
    JOB_DELETED: "Job opening deleted",
    APPLIED: "Application submitted successfully",
    STATUS_UPDATED: "Application status updated",
  },
  RESIGNATION: {
    SUBMITTED: "Resignation submitted",
    APPROVED: "Resignation approved",
    REJECTED: "Resignation rejected",
  },
  NOTIFICATION: {
    SENT: "Notification sent",
    FETCHED: "Notifications fetched",
    MARKED_READ: "Notifications marked as read",
  },
  SALARY: {
    CREATED: "Salary structure created",
    UPDATED: "Salary structure updated",
    FETCHED: "Salary structure fetched",
    PAYROLL_PROCESSED: "Payroll processed",
  },
};

export const errorMessage = {
  AUTH: {
    UNAUTHORIZED: "Unauthorized access",
    INVALID_CREDENTIALS: "Invalid credentials",
    TOKEN_EXPIRED: "Token expired",
    INVALID_TOKEN: "Invalid token",
  },
  USER: {
    NOT_FOUND: "User not found",
    ALREADY_EXISTS: "User already exists",
    UPDATE_FAILED: "Failed to update user",
  },
  EMPLOYEE: {
    NOT_FOUND: "Employee not found",
    ALREADY_EXISTS: "Employee already exists",
  },
  GENERAL: {
    INTERNAL_ERROR: "Internal server error",
    NOT_FOUND: "Resource not found",
    VALIDATION_ERROR: "Validation error",
    FORBIDDEN: "Access forbidden",
  },
};
