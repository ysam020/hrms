export interface SalaryComponent {
  id: string;
  name: string;
  code: string;
  type: "earning" | "deduction";
  isTaxable: boolean;
  calcType: "fixed" | "percent_of_basic" | "formula";
  percentValue: number | null;
  isStatutory: boolean;
  isRecurring: boolean;
  displayOrder: number;
}

export interface PtSlab {
  id: string;
  state: string;
  minGross: number;
  maxGross: number | null;
  monthlyPT: number;
}

export interface IncomeTaxSlab {
  id: string;
  financialYear: string;
  regime: "old" | "new";
  minIncome: number;
  maxIncome: number | null;
  ratePercent: number;
}

export interface PayCycle {
  id: string;
  name: string;
  frequency: "monthly" | "biweekly" | "weekly";
  payDay: number;
  isDefault: boolean;
}

export const EMPTY_COMPONENT_FORM = {
  name: "",
  code: "",
  type: "earning" as "earning" | "deduction",
  isTaxable: true,
  calcType: "fixed" as "fixed" | "percent_of_basic" | "formula",
  percentValue: 0,
  isRecurring: true,
  displayOrder: 0,
};

export const EMPTY_SLAB_FORM = {
  state: "",
  minGross: 0,
  maxGross: "" as number | "",
  monthlyPT: 0,
};

export const EMPTY_CYCLE_FORM = {
  name: "",
  frequency: "monthly" as PayCycle["frequency"],
  payDay: 1,
  isDefault: false,
};

export function currentFinancialYear(): string {
  const now = new Date();
  const startYear =
    now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export const EMPTY_TAX_SLAB_FORM = {
  financialYear: currentFinancialYear(),
  regime: "new" as "old" | "new",
  minIncome: 0,
  maxIncome: "" as number | "",
  ratePercent: 0,
};

export interface TabSectionProps {
  canEdit: boolean;
  onRefetch: () => Promise<void>;
  setAlert: (alert: {
    open: boolean;
    message: string;
    severity: "success" | "error" | "info" | "warning";
  }) => void;
}
