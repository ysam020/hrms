import React from "react";
import TabsPanel from "../../customComponents/TabsPanel";
const TrainingForm = React.lazy(() => import("./TrainingForm"));
const ViewTrainings = React.lazy(() => import("./ViewTrainings"));

function Appraisal() {
  const tabData = [
    { label: "Training Form", component: TrainingForm },
    { label: "View Trainings", component: ViewTrainings },
  ];

  return <TabsPanel tabData={tabData} tabKey="training_tab_value" />;
}

export default React.memo(Appraisal);
