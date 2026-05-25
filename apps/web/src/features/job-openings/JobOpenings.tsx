import { memo, useCallback, useContext, useState } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import NewJobOpening from "./NewJobOpening";
import ViewJobOpenings from "./ViewJobOpenings";
import Insights from "./Insights";

function JobOpenings() {
  const { user } = useContext(UserContext);
  const [refreshKey, setRefreshKey] = useState(0);
  const onSaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  const canCreate = hasPermission(
    "JobOpenings",
    "create_job_opening",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );

  const tabData = [
    ...(canCreate
      ? [
          {
            label: "New Job Opening",
            component: <NewJobOpening onSaved={onSaved} />,
          },
        ]
      : []),
    {
      label: "View Job Openings",
      component: <ViewJobOpenings refreshKey={refreshKey} />,
    },
    { label: "Insights", component: <Insights /> },
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="job_openings_tab_value"
      basePath="/job-openings"
    />
  );
}

export default memo(JobOpenings);
