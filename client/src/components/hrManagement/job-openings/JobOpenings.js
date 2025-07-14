import React from "react";
import TabsPanel from "../../customComponents/TabsPanel";
import NewJobOpening from "./NewJobOpening";
import ViewJobOpenings from "./ViewJobOpenings";

function Appraisal() {
  const tabData = [
    { label: "New Job Opening", component: NewJobOpening },
    { label: "View Job Openings", component: ViewJobOpenings },
  ];

  return <TabsPanel tabData={tabData} tabKey="job_openings_tab_value" />;
}

export default React.memo(Appraisal);
