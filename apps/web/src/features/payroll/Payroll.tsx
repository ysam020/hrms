import { memo, useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import PayrollRuns from "./PayrollRuns";
import SalaryAdvances from "./SalaryAdvances";
import MyPayslips from "./MyPayslips";
import SalaryManagement from "../salary/SalaryManagement";

function Payroll() {
  const { user } = useContext(UserContext);
  const isHr =
    user?.role?.some((r: string) => ["owner", "admin", "hr"].includes(r)) ||
    user?.isSuperUser;

  const tabData = [
    { label: "Payroll Runs", component: PayrollRuns },
    // Salary Management is HR-only: viewing/editing each employee's salary
    // structure. The tab click goes to /payroll/salary-management (the list);
    // clicking an employee row navigates to /payroll/salary-management/:userId
    // which is a separate route that sits outside TabsPanel.
    ...(isHr
      ? [{ label: "Salary Management", component: SalaryManagement }]
      : []),
    { label: "Salary Advances", component: SalaryAdvances },
    { label: "My Payslips", component: MyPayslips },
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
