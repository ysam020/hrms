export interface EmailJobData {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface NotificationJobData {
  title: string;
  message: string;
  /** Array of user IDs (ObjectId strings) to store as DB recipients */
  recipients?: string[];
  /** Array of usernames to target for push/WS delivery */
  pushTargets?: string[];
  /** Legacy single-target backward compat */
  targetUser?: string | string[];
  eventType?: string;
  sendPushNotification?: boolean;
  priority?: "high" | "medium" | "low";
  metadata?: Record<string, unknown>;
}

export type SchedulerJobName =
  | "updateExpiredHrActivities"
  | "updateExpiredJobOpenings"
  | "updateEmployeeStatus"
  | "reconcileAttendance"
  | "updateLeaveBalance"
  | "sendKycReminders"
  | "cleanupFcmTokens"
  | "checkSubscriptionExpiry";

export interface SchedulerJobData {
  jobName: SchedulerJobName;
}

export interface ResumeParsingJobData {
  applicationId: string;
}
