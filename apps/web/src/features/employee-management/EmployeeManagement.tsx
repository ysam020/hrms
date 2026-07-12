import TabsPanel from "@web/shared/components/TabsPanel";
import { memo, useContext } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import EmployeeList from "./EmployeeList";
import EmployeeInsights from "./EmployeeInsights";

function EmployeeManagement() {
  const { user } = useContext(UserContext);
  const tabData = [
    { label: "Employee List", component: EmployeeList },
    ...(isHrOrAbove(user)
      ? [{ label: "Insights", component: EmployeeInsights }]
      : []),
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="employee_management_tab_value"
      basePath="/employee-management"
    />
  );
}

export default memo(EmployeeManagement);
