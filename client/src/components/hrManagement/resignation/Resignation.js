import React from "react";
import TabsPanel from "../../customComponents/TabsPanel";
const ResignationForm = React.lazy(() => import("./ResignationForm"));
const ViewResignations = React.lazy(() => import("./ViewResignations"));
const ExitFeedbackForm = React.lazy(() => import("./ExitFeedbackForm"));

function Appraisal() {
  const tabData = [
    { label: "Resignation Form", component: ResignationForm },
    { label: "View Resignations", component: ViewResignations },
    { label: "Exit Feedback", component: ExitFeedbackForm },
  ];

  return <TabsPanel tabData={tabData} tabKey="resignation_tab_value" />;
}

export default React.memo(Appraisal);
