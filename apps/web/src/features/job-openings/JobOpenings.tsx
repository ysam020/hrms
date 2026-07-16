import { memo, useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import ViewJobOpenings from "./ViewJobOpenings";
import Insights from "./Insights";

function JobOpenings() {
  const { user } = useContext(UserContext);

  const tabData = [
    { label: "View Job Openings", component: <ViewJobOpenings /> },
    ...(isHrOrAbove(user)
      ? [{ label: "Insights", component: <Insights /> }]
      : []),
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
