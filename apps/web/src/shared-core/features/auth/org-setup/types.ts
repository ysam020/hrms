import type { WorkWeekValue } from "@web/shared/components/WorkWeekPicker";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  role: string;
}

// Only non-sensitive form fields — no payment credentials.
export const PENDING_FORM_KEY = "hrms_pending_org_form";

export interface PendingOrgForm {
  orgName: string;
  industry: string;
  companySize: string;
  workWeek: WorkWeekValue;
}

export type Billing = "monthly" | "annual";
