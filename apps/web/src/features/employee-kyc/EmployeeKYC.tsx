import React from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
const CompleteKYC = React.lazy(() => import("./CompleteKYC"));
const ViewKycList = React.lazy(() => import("./ViewKycList"));
const Insights = React.lazy(() => import("./Insights"));

function EmployeeKyc() {
  const tabData = [
    { label: "View Employee KYCs", component: ViewKycList },
    { label: "Complete KYC", component: CompleteKYC },
    { label: "Insights", component: Insights },
  ];

  return <TabsPanel tabData={tabData} tabKey="kyc_tab_value" basePath="/kyc" />;
}

export default React.memo(EmployeeKyc);
