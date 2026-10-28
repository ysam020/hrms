import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  BarList,
  ChartBlock,
  ChartGrid,
  Meter,
  Metric,
  Metrics,
  OTHER,
  SERIES,
} from "@next/ui";
import { useGet } from "@next/lib/hooks";
import { InsightsFrame } from "../insights/shared";

// Asset summary — GET /assets/summary (Classic's AssetSummary).

export default function AssetSummary() {
  const { data, loading, error, refetch } = useGet<any>(
    API_ENDPOINTS.ASSET_SUMMARY,
  );
  const by = data?.byStatus ?? {};
  return (
    <InsightsFrame
      title="Asset Summary"
      loading={loading}
      error={error}
      onRetry={refetch}
    >
      <Metrics label="Inventory">
        <Metric label="Total" value={data?.total ?? "—"} />
        <Metric label="Available" value={by.available ?? 0} />
        <Metric label="Assigned" value={by.assigned ?? 0} />
        <Metric label="In Maintenance" value={by.maintenance ?? 0} />
        <Metric label="Retired" value={by.retired ?? 0} />
      </Metrics>
      <ChartGrid>
        <ChartBlock title="Status">
          <Meter
            label="Assets by status"
            parts={[
              { label: "Assigned", value: by.assigned ?? 0, color: SERIES[0] },
              {
                label: "Available",
                value: by.available ?? 0,
                color: SERIES[2],
              },
              {
                label: "In Maintenance",
                value: by.maintenance ?? 0,
                color: SERIES[3],
              },
              { label: "Retired", value: by.retired ?? 0, color: OTHER },
            ]}
          />
        </ChartBlock>
        <ChartBlock title="By Category">
          <BarList
            label="Assets by category"
            data={Object.entries(data?.byCategory ?? {}).map(
              ([label, value]) => ({ label, value: Number(value) || 0 }),
            )}
          />
        </ChartBlock>
      </ChartGrid>
    </InsightsFrame>
  );
}
