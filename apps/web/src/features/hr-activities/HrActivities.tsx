import React, { useState, useCallback, useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
const AddHrActivity = React.lazy(() => import("./AddHrActivity"));
const ViewHrActivities = React.lazy(() => import("./ViewHrActivities"));

function HrActivities() {
  const { user } = useContext(UserContext);
  const [refreshKey, setRefreshKey] = useState(0);
  const onSaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  const canCreate = hasPermission(
    "HRActivities",
    "create",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );

  const tabData = [
    ...(canCreate
      ? [
          {
            label: "Add New Activity",
            component: <AddHrActivity onSaved={onSaved} />,
          },
        ]
      : []),
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
