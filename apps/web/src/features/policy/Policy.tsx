import React, { useMemo, useState, useCallback } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";

const CreatePolicy = React.lazy(() => import("./CreatePolicy"));
const ViewPolicies = React.lazy(() => import("./ViewPolicies"));

function Policy() {
  const [refreshKey, setRefreshKey] = useState(0);
  const onPolicySaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  const tabData = useMemo(
    () => [
      {
        label: "Create Policy",
        component: <CreatePolicy onSaved={onPolicySaved} />,
      },
      {
        label: "View Policies",
        component: <ViewPolicies refreshKey={refreshKey} />,
      },
    ],
    [onPolicySaved, refreshKey],
  );

  return (
    <TabsPanel tabData={tabData} tabKey="policy_tab_value" basePath="/policy" />
  );
}

export default React.memo(Policy);
