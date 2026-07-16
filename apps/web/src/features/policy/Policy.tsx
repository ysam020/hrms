import { lazy, memo, useMemo } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";

const ViewPolicies = lazy(() => import("./ViewPolicies"));

function Policy() {
  const tabData = useMemo(
    () => [
      {
        label: "View Policies",
        component: <ViewPolicies />,
      },
    ],
    [],
  );

  return (
    <TabsPanel tabData={tabData} tabKey="policy_tab_value" basePath="/policy" />
  );
}

export default memo(Policy);
