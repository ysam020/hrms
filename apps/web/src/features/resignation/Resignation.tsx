import React from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
const ResignationForm = React.lazy(() => import("./ResignationForm"));
const ViewResignations = React.lazy(() => import("./ViewResignations"));
const ExitFeedbackForm = React.lazy(() => import("./ExitFeedbackForm"));
const Insights = React.lazy(() => import("./Insights"));

function Resignations() {
  const tabData = [
    { label: "Resignation Form", component: ResignationForm },
    { label: "View Resignations", component: ViewResignations },
    { label: "Exit Feedback", component: ExitFeedbackForm },
    {
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          Insights
          <AutoAwesomeIcon sx={{ fontSize: 16, color: "#FF9800" }} />
        </span>
      ),
      component: Insights,
      slug: "insights",
    },
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
