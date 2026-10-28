import type { PendingApprovalItem } from "@web/app/providers/ApprovalsBadgeContext";
import { StaggerItem } from "@next/motion";
import { TransitionLink } from "@next/motion";
import { Avatar, Button, Icon, Tag } from "@next/ui";
import { fromNow } from "@next/lib/format";
import { MODULE_LABELS, clickThroughPath, isClickThrough } from "./decision";
import s from "./ApprovalRow.module.css";

export function ApprovalRow({
  item,
  index,
  onApprove,
  onReject,
}: {
  item: PendingApprovalItem;
  index: number;
  onApprove: () => void;
  onReject: () => void;
}) {
  const meta = (
    <span className={s.meta}>
      <Tag>{MODULE_LABELS[item.module] ?? item.module}</Tag>
      {"stepOrder" in item && item.stepOrder > 1 && (
        <Tag>Step {item.stepOrder}</Tag>
      )}
      <span>{item.requestedByName}</span>
      {item.createdAt && <span>· {fromNow(item.createdAt)}</span>}
    </span>
  );
  return (
    <StaggerItem index={index} className={s.row}>
      <Avatar name={item.requestedByName || "?"} size={32} />
      {isClickThrough(item) ? (
        <>
          <TransitionLink
            to={clickThroughPath(item)}
            className={`${s.text} ${s.link}`}
          >
            <span className={s.summary}>{item.summary}</span>
            {meta}
          </TransitionLink>
          <div className={s.actions}>
            <TransitionLink
              to={clickThroughPath(item)}
              aria-label={`Review ${item.summary}`}
            >
              <Button size="small">
                Review <Icon name="chevronRight" size={12} />
              </Button>
            </TransitionLink>
          </div>
        </>
      ) : (
        <>
          <div className={s.text}>
            <span className={s.summary}>{item.summary}</span>
            {meta}
          </div>
          <div className={s.actions}>
            <Button
              size="small"
              variant="tintedDanger"
              onClick={onReject}
              aria-label={`Reject ${item.summary}`}
            >
              Reject
            </Button>
            <Button
              size="small"
              variant="tinted"
              onClick={onApprove}
              aria-label={`Approve ${item.summary}`}
            >
              Approve
            </Button>
          </div>
        </>
      )}
    </StaggerItem>
  );
}
