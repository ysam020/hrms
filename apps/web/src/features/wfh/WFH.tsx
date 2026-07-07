import { memo } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import WFHRequests from "./WFHRequests";
import WFHCalendar from "./WFHCalendar";

function WFH() {
  const tabData = [
    { label: "Requests", component: WFHRequests },
    { label: "Calendar", component: WFHCalendar },
  ];

  return <TabsPanel tabData={tabData} tabKey="wfh_tab_value" basePath="/wfh" />;
}

export default memo(WFH);
