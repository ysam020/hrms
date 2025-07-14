import React from "react";
import TabsPanel from "../../customComponents/TabsPanel";
const AddHrActivity = React.lazy(() => import("./AddHrActivity"));
const ViewHrActivities = React.lazy(() => import("./ViewHrActivities"));

function Appraisal() {
  const tabData = [
    { label: "Add New Activity", component: AddHrActivity },
    { label: "View Activities", component: ViewHrActivities },
  ];

  return <TabsPanel tabData={tabData} tabKey="hr_activities_tab_value" />;
}

export default React.memo(Appraisal);
