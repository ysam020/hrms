import type { ReactNode } from "react";
import {
  Banner,
  ErrorState,
  Page,
  Skeleton,
  StatusBadge,
  type Tone,
  InsightsSkeleton,
} from "@next/ui";
import { fmtDate } from "@next/lib/format";

/** Common frame for module insight pages: metrics row, then charts. */
export function InsightsFrame({
  title,
  loading,
  error,
  onRetry,
  updated,
  tabs,
  children,
}: {
  title: string;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  updated?: string;
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Page
      title={title}
      subtitle={updated ? `Updated ${fmtDate(updated)}` : undefined}
      tabs={tabs}
    >
      <div data-tour="insights-body">
        {loading ? (
          <InsightsSkeleton />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : (
          <div style={{ display: "grid", gap: 40 }}>{children}</div>
        )}
      </div>
    </Page>
  );
}

const PRIORITY: Record<string, Tone> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

/** Server-generated recommendations ("actionableInsights"). */
export function ActionList({
  items,
}: {
  items?: {
    title?: string;
    message?: string;
    action?: string;
    priority?: string;
    type?: string;
  }[];
}) {
  if (!items?.length) return null;
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h2 className="px-section">Worth Your Attention</h2>
      <ul style={{ display: "grid", gap: 10 }}>
        {items.map((i, n) => (
          <li key={n}>
            <Banner
              tone={
                i.type === "success"
                  ? "success"
                  : (PRIORITY[i.priority ?? ""] ?? "accent")
              }
            >
              <b>{i.title}</b> {i.message}
              {i.action && <span className="px-meta"> {i.action}</span>}
            </Banner>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const pct = (v?: number | null) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : `${Math.round(Number(v) * 10) / 10}%`;
export const PriorityBadge = ({ p }: { p?: string }) => (
  <StatusBadge tone={PRIORITY[p ?? ""] ?? "neutral"}>{p ?? "—"}</StatusBadge>
);
