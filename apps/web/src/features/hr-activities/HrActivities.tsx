import { lazy, memo } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
const ViewHrActivities = lazy(() => import("./ViewHrActivities"));

function HrActivities() {
  const tabData = [
    {
      label: "View Activities",
      component: <ViewHrActivities />,
    },
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="hr_activities_tab_value"
      basePath="/hr-activities"
    />
  );
}

export default memo(HrActivities);
