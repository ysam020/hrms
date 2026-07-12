import React, { useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
const CompleteKYC = React.lazy(() => import("./CompleteKYC"));
const ViewKycList = React.lazy(() => import("./ViewKycList"));
const Insights = React.lazy(() => import("./Insights"));

function EmployeeKyc() {
  const { user } = useContext(UserContext);
  const tabData = [
    { label: "View Employee KYCs", component: ViewKycList },
    { label: "Complete KYC", component: CompleteKYC },
    ...(isHrOrAbove(user) ? [{ label: "Insights", component: Insights }] : []),
  ];

  return <TabsPanel tabData={tabData} tabKey="kyc_tab_value" basePath="/kyc" />;
}

export default React.memo(EmployeeKyc);
