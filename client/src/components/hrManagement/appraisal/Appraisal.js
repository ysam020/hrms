import React, { lazy } from "react";
import TabsPanel from "../../customComponents/TabsPanel";

const AppraisalForm = lazy(() => import("./AppraisalForm"));
const ViewAppraisals = lazy(() => import("./ViewAppraisals"));

function Appraisal() {
  const tabData = [
    { label: "Appraisal Form", component: AppraisalForm },
    { label: "View Appraisals", component: ViewAppraisals },
  ];

  return <TabsPanel tabData={tabData} tabKey="appraisal_tab_value" />;
}

export default React.memo(Appraisal);
