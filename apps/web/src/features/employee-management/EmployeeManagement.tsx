import TabsPanel from "@web/shared/components/TabsPanel";
import * as React from "react";
import EmployeeList from "./EmployeeList";
import EmployeeInsights from "./EmployeeInsights";

function EmployeeManagement() {
  const tabData = [
    { label: "Employee List", component: EmployeeList },
    { label: "Insights", component: EmployeeInsights },
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="employee_management_tab_value"
      basePath="/employee-management"
    />
  );
}

export default React.memo(EmployeeManagement);
