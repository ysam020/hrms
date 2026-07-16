import {
  defaultWorkWeek,
  type WorkWeekValue,
} from "@web/shared/components/WorkWeekPicker";

export interface CustomLeaveType {
  name: string;
  key: string;
  daysPerYear: number;
  requiresProof: boolean;
}

export interface LeavePolicy {
  key: string;
  name: string;
  daysPerYear: number;
  isStatutory: boolean;
  requiresProof: boolean;
  accrualMethod: "lump_sum" | "monthly";
  prorateByJoinDate: boolean;
  carryForward: {
    enabled: boolean;
    maxDays: number | null;
    expiryMonths: number | null;
  };
  encashment: {
    enabled: boolean;
    ratePerDay: number | null;
    maxDaysPerYear: number | null;
  };
  isCompOff: boolean;
  compOffExpiryDays: number | null;
  onExhaustion: "reject" | "auto_lop" | "manager_override";
}

export const EMPTY_LEAVE_POLICY: LeavePolicy = {
  key: "",
  name: "",
  daysPerYear: 0,
  isStatutory: false,
  requiresProof: false,
  accrualMethod: "lump_sum",
  prorateByJoinDate: true,
  carryForward: { enabled: false, maxDays: null, expiryMonths: null },
  encashment: { enabled: false, ratePerDay: null, maxDaysPerYear: null },
  isCompOff: false,
  compOffExpiryDays: 90,
  onExhaustion: "manager_override",
};

export interface SettingsSnapshot {
  id: string | null;
  effectiveFrom: string | null;
  note: string | null;
  workWeekPattern: WorkWeekValue;
  paidLeavesPerYear: number;
  sickLeavesPerYear: number;
  casualLeavesPerYear: number;
  medicalCertRequired: boolean;
  customLeaveTypes: CustomLeaveType[];
  leavePolicies: LeavePolicy[];
  workStartHour: number;
  workStartMinute: number;
  lateGracePeriodMinutes: number;
  fullDayMinHours: number;
  halfDayMinHours: number;
  regularizationBackdateWindowDays: number;
  overtimePreApprovalRequired: boolean;
  probationPeriodDays: number;
  noticePeriodDays: number;
  maxInterviewRounds: number;
  // Geofencing
  geofencingEnabled: boolean;
  officeLatitude: number | null;
  officeLongitude: number | null;
  officeName: string | null;
  geofenceRadiusMeters: number;
  // Modules
  wfhEnabled: boolean;
}

export const SCHEMA_DEFAULTS: SettingsSnapshot = {
  id: null,
  effectiveFrom: null,
  note: null,
  workWeekPattern: defaultWorkWeek(),
  paidLeavesPerYear: 12,
  sickLeavesPerYear: 12,
  casualLeavesPerYear: 6,
  medicalCertRequired: false,
  customLeaveTypes: [],
  leavePolicies: [],
  workStartHour: 9,
  workStartMinute: 0,
  lateGracePeriodMinutes: 30,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
  regularizationBackdateWindowDays: 3,
  overtimePreApprovalRequired: false,
  probationPeriodDays: 90,
  noticePeriodDays: 30,
  maxInterviewRounds: 5,
  // Geofencing
  geofencingEnabled: false,
  officeLatitude: null,
  officeLongitude: null,
  officeName: null,
  geofenceRadiusMeters: 200,
  // Modules
  wfhEnabled: true,
};

export interface SectionProps {
  settings: SettingsSnapshot;
  onChange: (patch: Partial<SettingsSnapshot>) => void;
  readOnly: boolean;
}
