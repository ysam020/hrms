import React, { useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
const ViewResignations = React.lazy(() => import("./ViewResignations"));
const ExitFeedbackForm = React.lazy(() => import("./ExitFeedbackForm"));
const Insights = React.lazy(() => import("./Insights"));

function Resignations() {
  const { user } = useContext(UserContext);
  const tabData = [
    { label: "View Resignations", component: ViewResignations },
    { label: "Exit Feedback", component: ExitFeedbackForm },
    ...(isHrOrAbove(user)
      ? [{ label: "Insights", component: Insights, slug: "insights" }]
      : []),
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="resignation_tab_value"
      basePath="/resignation-process"
    />
  );
}

export default React.memo(Resignations);
