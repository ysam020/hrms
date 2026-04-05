import React, { useState, useCallback } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
const AddHrActivity = React.lazy(() => import("./AddHrActivity"));
const ViewHrActivities = React.lazy(() => import("./ViewHrActivities"));

function HrActivities() {
  const [refreshKey, setRefreshKey] = useState(0);
  const onSaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  const tabData = [
    {
      label: "Add New Activity",
      component: <AddHrActivity onSaved={onSaved} />,
    },
    {
      label: "View Activities",
      component: <ViewHrActivities refreshKey={refreshKey} />,
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

export default React.memo(HrActivities);
