import { useContext, useMemo, useState } from "react";
import { ApprovalsBadgeContext } from "@web/app/providers/ApprovalsBadgeContext";
import { StaggerList } from "@next/motion";
import {
  EmptyState,
  IconButton,
  Page,
  SegmentedControl,
  Skeleton,
} from "@next/ui";
import { plural } from "@next/lib/format";
import { MODULE_LABELS, useDecision } from "./decision";
import { ApprovalRow } from "./ApprovalRow";

/** Everything awaiting the signed-in person's decision, across modules. */
export default function Approvals() {
  const {
    pendingApprovalItems,
    loadingPendingApprovals,
    refetchPendingApprovals,
  } = useContext(ApprovalsBadgeContext);
  const { approve, reject, decided, dialog } = useDecision();
  const [filter, setFilter] = useState("all");

  const items = pendingApprovalItems.filter((i) => !decided.has(i.instanceId));
  const modules = useMemo(
    () => Array.from(new Set(items.map((i) => i.module))),
    [items],
  );
  const shown =
    filter === "all" ? items : items.filter((i) => i.module === filter);

  return (
    <Page
      title="Approvals"
      subtitle={
        loadingPendingApprovals && !items.length
          ? "Loading…"
          : items.length
            ? `${plural(items.length, "request")} waiting on you`
            : "Nothing waiting on you"
      }
      width="reading"
      actions={
        <IconButton
          icon="refresh"
          label="Refresh"
          onClick={refetchPendingApprovals}
        />
      }
      tabs={
        modules.length > 1 ? (
          <SegmentedControl
            role="radiogroup"
            label="Filter by type"
            value={filter}
            onChange={setFilter}
            segments={[
              { value: "all", label: "All", count: items.length },
              ...modules.map((m) => ({
                value: m,
                label: MODULE_LABELS[m] ?? m,
                count: items.filter((i) => i.module === m).length,
              })),
            ]}
          />
        ) : undefined
      }
    >
      {loadingPendingApprovals && items.length === 0 ? (
        <div style={{ display: "grid", gap: 18, paddingTop: 12 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "grid", gap: 6 }}>
              <Skeleton width="55%" height={16} />
              <Skeleton width="30%" height={12} />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon="checkCircle" title="You’re all caught up">
          Leave, WFH, resignation, overtime, advance, and KYC requests that need
          your decision will appear here.
        </EmptyState>
      ) : (
        <StaggerList>
          {shown.map((item, i) => (
            <ApprovalRow
              key={item.instanceId}
              item={item}
              index={i}
              onApprove={() => approve(item)}
              onReject={() => reject(item)}
            />
          ))}
        </StaggerList>
      )}
      {dialog}
    </Page>
  );
}
