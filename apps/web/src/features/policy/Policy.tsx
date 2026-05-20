import React, { useMemo, useState, useCallback, useContext } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import { UserContext } from "@web/app/providers/UserContext";
import hasPermission from "@web/shared/utils/permissions/hasPermission";

const CreatePolicy = React.lazy(() => import("./CreatePolicy"));
const ViewPolicies = React.lazy(() => import("./ViewPolicies"));

function Policy() {
  const { user } = useContext(UserContext);
  const [refreshKey, setRefreshKey] = useState(0);
  const onPolicySaved = useCallback(() => setRefreshKey((k) => k + 1), []);

  const canCreate = hasPermission(
    "Policy",
    "create",
    "-",
    user?.isSuperUser,
    user?.permissions || [],
  );

  const tabData = useMemo(
    () => [
      ...(canCreate
        ? [
            {
              label: "Create Policy",
              component: <CreatePolicy onSaved={onPolicySaved} />,
            },
          ]
        : []),
      {
        label: "View Policies",
        component: <ViewPolicies refreshKey={refreshKey} />,
      },
    ],
    [canCreate, onPolicySaved, refreshKey],
  );

  return (
    <TabsPanel tabData={tabData} tabKey="policy_tab_value" basePath="/policy" />
  );
}

export default React.memo(Policy);
