import { memo, useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isHrOrAbove } from "@web/shared/utils/permissions/navAccess";
import AssetInventory from "./AssetInventory";
import AssetSummary from "./AssetSummary";
import AssetIssues from "./AssetIssues";

function AssetManagement() {
  const { user } = useContext(UserContext);
  const canViewSummary =
    isHrOrAbove(user) ||
    hasPermission(
      "Assets",
      "manage",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    );

  const tabData = [
    { label: "Inventory", component: AssetInventory },
    { label: "Issues", component: AssetIssues },
    ...(canViewSummary ? [{ label: "Summary", component: AssetSummary }] : []),
  ];

  return (
    <TabsPanel tabData={tabData} tabKey="assets_tab_value" basePath="/assets" />
  );
}

export default memo(AssetManagement);
