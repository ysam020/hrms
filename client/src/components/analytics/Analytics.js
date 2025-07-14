import React, { lazy,  } from "react";
import TabsPanel from "../customComponents/TabsPanel";


const EmployeeDemographics = lazy(() => import("./EmployeeDemographics"));
const EmployeePerformance = lazy(() => import("./EmployeePerformance"));

function Analytics() {
  
  const tabData = [
    { label: "Employee Demographics", component: EmployeeDemographics },
    { label: "Employee Performance", component: EmployeePerformance },
  ];

  return <TabsPanel tabData={tabData} tabKey="analytics_tab_value" />;
}

export default React.memo(Analytics);
