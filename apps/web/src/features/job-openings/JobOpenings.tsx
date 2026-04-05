import React, { useState, useCallback } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import NewJobOpening from "./NewJobOpening";
import ViewJobOpenings from "./ViewJobOpenings";
import Insights from "./Insights";

function JobOpenings() {
  const [refreshKey, setRefreshKey] = useState(0);
  const onSaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  const tabData = [
    {
      label: "New Job Opening",
      component: <NewJobOpening onSaved={onSaved} />,
    },
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

export default React.memo(JobOpenings);
