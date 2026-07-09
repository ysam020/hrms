import { memo } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import AssetInventory from "./AssetInventory";
import AssetSummary from "./AssetSummary";
import AssetIssues from "./AssetIssues";

function AssetManagement() {
  const tabData = [
    { label: "Inventory", component: AssetInventory },
    { label: "Issues", component: AssetIssues },
    { label: "Summary", component: AssetSummary },
  ];

  return (
    <TabsPanel tabData={tabData} tabKey="assets_tab_value" basePath="/assets" />
  );
}

export default memo(AssetManagement);
