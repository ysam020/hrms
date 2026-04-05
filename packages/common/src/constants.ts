export enum UserRoleEnum {
  ADMIN = "admin",
  EMPLOYEE = "employee",
  HR = "hr",
  MANAGER = "manager",
}

export enum LeaveTypeEnum {
  ANNUAL = "annual",
  SICK = "sick",
  CASUAL = "casual",
  MATERNITY = "maternity",
  PATERNITY = "paternity",
  UNPAID = "unpaid",
}

export enum AttendanceStatusEnum {
  PRESENT = "present",
  ABSENT = "absent",
  LATE = "late",
  HALF_DAY = "half_day",
  ON_LEAVE = "on_leave",
  HOLIDAY = "holiday",
}

export enum ApplicationStatusEnum {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}
