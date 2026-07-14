import { memo, useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import {
  isHrOrAbove,
  canManageSalary as canManageSalaryAccess,
} from "@web/shared/utils/permissions/navAccess";
import PayrollRuns from "./PayrollRuns";
import SalaryAdvances from "./SalaryAdvances";
import MyPayslips from "./MyPayslips";
import SalaryManagement from "../salary/SalaryManagement";
import MyTaxDeclaration from "./tax-declaration/MyTaxDeclaration";
import ReviewTaxDeclarations from "./tax-declaration/ReviewTaxDeclarations";

function Payroll() {
  const { user } = useContext(UserContext);
  const isHr = isHrOrAbove(user);
  const canManageSalary = canManageSalaryAccess(user);

  const tabData = [
    ...(isHr ? [{ label: "Payroll Runs", component: PayrollRuns }] : []),
    // Salary Management is gated by role (owner/admin/hr/superuser) or the
    // SalaryManagement view_salaries/update_salary permissions. The tab click
    // goes to /payroll/salary-management (the list); clicking an employee row
    // navigates to /payroll/salary-management/:userId which is a separate
    // route that sits outside TabsPanel.
    ...(canManageSalary
      ? [{ label: "Salary Management", component: SalaryManagement }]
      : []),
    { label: "Salary Advances", component: SalaryAdvances },
    { label: "My Payslips", component: MyPayslips },
    { label: "My Tax Declaration", component: MyTaxDeclaration },
    ...(isHr
      ? [{ label: "Tax Declarations", component: ReviewTaxDeclarations }]
      : []),
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="payroll_tab_value"
      basePath="/payroll"
    />
  );
}

export default memo(Payroll);
