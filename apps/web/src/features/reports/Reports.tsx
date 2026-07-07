import { memo } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import ReportBuilder from "./ReportBuilder";
import SavedReports from "./SavedReports";

function Reports() {
  const tabData = [
    { label: "Report Builder", component: ReportBuilder },
    { label: "Saved Reports", component: SavedReports },
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="reports_tab_value"
      basePath="/reports"
    />
  );
}

export default memo(Reports);
