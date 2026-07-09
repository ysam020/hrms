import { memo } from "react";
import TabsPanel from "@web/shared/components/TabsPanel";
import WebhookEndpoints from "./WebhookEndpoints";
import WebhookDeliveries from "./WebhookDeliveries";

function Webhooks() {
  const tabData = [
    { label: "Endpoints", component: WebhookEndpoints },
    { label: "Delivery Log", component: WebhookDeliveries },
  ];

  return (
    <TabsPanel
      tabData={tabData}
      tabKey="webhooks_tab_value"
      basePath="/webhooks"
    />
  );
}

export default memo(Webhooks);
