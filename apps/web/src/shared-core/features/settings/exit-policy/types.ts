export interface NoticePeriodPolicy {
  id: string;
  minTenureMonths: number;
  maxTenureMonths: number | null;
  designation: string | null;
  department: string | null;
  noticePeriodDays: number;
  isProbationPolicy: boolean;
  priority: number;
}

export interface ExitChecklistItemDef {
  id: string;
  label: string;
  owningRole: string;
  isRequired: boolean;
  order: number;
}

export interface ExitQuestion {
  id: string;
  label: string;
  type: "rating" | "text" | "boolean";
  required: boolean;
}

export const EMPTY_POLICY_FORM = {
  minTenureMonths: 0,
  maxTenureMonths: "" as number | "",
  designation: "",
  department: "",
  noticePeriodDays: 30,
  isProbationPolicy: false,
  priority: 0,
};

export const EMPTY_CHECKLIST_FORM = {
  label: "",
  owningRole: "IT" as string,
  isRequired: true,
  order: 0,
};

export function newQuestionId() {
  return `q_${Math.random().toString(36).slice(2, 10)}`;
}

export interface TabSectionProps {
  canEdit: boolean;
  setAlert: (alert: {
    open: boolean;
    message: string;
    severity: "success" | "error" | "info" | "warning";
  }) => void;
}
