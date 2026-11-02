import type { PendingApprovalItem } from "@web/app/providers/ApprovalsBadgeContext";
import {
  StaggerItem,
  TransitionLink,
  handOff,
  sharedPart,
  useTransitionWith,
} from "@next/motion";
import { Avatar, Button, Icon, Tag } from "@next/ui";
import { fromNow } from "@next/lib/format";
import { MODULE_LABELS, clickThroughPath, isClickThrough } from "./decision";
import s from "./ApprovalRow.module.css";

export function ApprovalRow({
  item,
  index,
  pairWith,
  onApprove,
  onReject,
}: {
  item: PendingApprovalItem;
  index: number;
  /** The other screen listing the same requests (Today ⇄ Approvals): the
   *  row morphs into its counterpart when navigating between them. */
  pairWith: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const betweenLists = useTransitionWith(pairWith);
  const clickThrough = isClickThrough(item) ? clickThroughPath(item) : null;
  // KYC requests open the person's KYC review: their avatar travels there.
  const toReview = useTransitionWith(clickThrough ?? "/__none__");
  const reviewKey =
    item.module === "kyc" && "username" in item ? item.username : null;
  const openReview = () => {
    if (reviewKey) handOff("person", reviewKey, { name: item.requestedByName });
  };
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
    <StaggerItem
      index={index}
      className={s.row}
      style={sharedPart("approval", item.instanceId, "row", betweenLists)}
    >
      <Avatar
        name={item.requestedByName || "?"}
        size={32}
        style={
          reviewKey
            ? sharedPart("person", reviewKey, "avatar", toReview)
            : undefined
        }
      />
      {clickThrough ? (
        <>
          <TransitionLink
            to={clickThrough}
            className={`${s.text} ${s.link}`}
            onClick={openReview}
          >
            <span className={s.summary}>{item.summary}</span>
            {meta}
          </TransitionLink>
          <div className={s.actions}>
            <TransitionLink
              to={clickThrough}
              aria-label={`Review ${item.summary}`}
              onClick={openReview}
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
