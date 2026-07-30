export const MESSAGES = {
  USERNAME_REQUIRED: "username is required",
  USERNAME_FROM_TO_REQUIRED: "username, from and to are required",
  INVALID_DATE_FORMAT: "Invalid date format. Use YYYY-MM-DD",
  END_DATE_BEFORE_START: "End date cannot be before start date",
  LEAVE_ALREADY_APPLIED: "Leave already applied for this date range",
  WFH_OVERLAPS_LEAVE_RANGE:
    "You already have a WFH request overlapping this date range",
  LEAVE_OVERLAPS_APPROVED_WFH:
    "This leave overlaps an already-approved WFH request for the same date(s)",
  WFH_OVERLAPS_APPROVED_LEAVE:
    "This WFH request overlaps an already-approved leave application for the same date(s)",
  LEAVE_APPLIED: "Leave applied successfully",
  LEAVE_ID_REQUIRED: "Leave ID is required",
  LEAVE_APPLICATION_NOT_FOUND: "Leave application not found",
  LEAVE_APPROVED: "Leave approved successfully",
  LEAVE_REJECTED: "Leave rejected",
  ONLY_PENDING_CAN_BE_APPROVED:
    "Only pending leave applications can be approved",
  ONLY_PENDING_CAN_BE_REJECTED:
    "Only pending leave applications can be rejected",
  CANNOT_CANCEL_OTHERS_LEAVE: "You can only cancel your own leave applications",
  LEAVE_CANCELLED: "Leave application cancelled",
  LEAVE_BALANCE_FETCHED: "Leave balance fetched successfully",
  NO_LEAVE_BALANCE: "No leave balance record found",
  LEAVE_FETCHED: "Leave application fetched successfully",
  LEAVE_APPLICATIONS_FETCHED: "Leave applications fetched successfully",
  LEAVE_BALANCE_UPDATED: "Leave balance updated successfully",
  INVALID_LEAVE_UNIT: "unit must be full_day, half_day, or short_leave",
  HALF_DAY_SESSION_REQUIRED:
    "session (first_half or second_half) is required for a half-day leave, and half-day leave must be a single day",
  SHORT_LEAVE_HOURS_REQUIRED:
    "shortLeaveHours is required for short leave, and short leave must be a single day",
  ONLY_APPROVED_CAN_REQUEST_CANCELLATION:
    "Only approved leave applications can have cancellation requested — pending applications can be cancelled directly",
  LEAVE_CANCELLATION_REQUESTED: "Cancellation requested — awaiting approval",
  CANNOT_CANCEL_IN_CURRENT_STATE:
    "Only pending or approved leave applications can be cancelled",
  INTERNAL_SERVER_ERROR: "Internal server error",
};
