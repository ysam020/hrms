import React from "react";
import TabsPanel from "../../customComponents/TabsPanel";
const CompleteKYC = React.lazy(() => import("./CompleteKYC"));
const ViewKycList = React.lazy(() => import("./ViewKycList"));

function EmployeeKyc() {
  const tabData = [
    { label: "View Employee KYCs", component: ViewKycList },
    { label: "Complete KYC", component: CompleteKYC },
  ];

  return <TabsPanel tabData={tabData} tabKey="kyc_tab_value" />;
}

export default React.memo(EmployeeKyc);
