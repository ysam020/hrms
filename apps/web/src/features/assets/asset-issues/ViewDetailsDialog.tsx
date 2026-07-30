import Dialog from "@mui/material/Dialog";
import DialogTitleWithClose from "@web/shared/components/DialogTitleWithClose";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import Button from "@web/shared/components/Button";
import StatusTimeline from "@web/shared/components/StatusTimeline";
import { DetailRow, PriorityLabel, StatusChip } from "./components";
import { ISSUE_TYPES } from "./constants";
import { buildAssetIssueStages } from "./helpers";
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";

export function ViewDetailsDialog({
  issue,
  onClose,
}: {
  issue: any;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!issue}
      onClose={ignoreBackdropClick(onClose)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitleWithClose onClose={onClose}>
        Issue Details
      </DialogTitleWithClose>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          pt: "16px !important",
        }}
      >
        <DetailRow
          label="Asset"
          value={
            issue?.asset
              ? `${issue.asset.assetCode} — ${issue.asset.name}`
              : "—"
          }
        />
        <DetailRow
          label="Type"
          value={
            ISSUE_TYPES.find((t) => t.value === issue?.type)?.label ??
            issue?.type
          }
        />
        <DetailRow
          label="Priority"
          value={issue && <PriorityLabel priority={issue.priority} />}
        />
        <DetailRow
          label="Status"
          value={issue && <StatusChip status={issue.status} />}
        />
        <DetailRow label="Title" value={issue?.title} />
        <DetailRow label="Description" value={issue?.description} />

        <Divider sx={{ my: 0.5 }} />
        <StatusTimeline stages={buildAssetIssueStages(issue)} />

        <DetailRow label="Reported By" value={issue?.reporter?.username} />

        {issue?.reviewedAt && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <DetailRow label="Reviewed By" value={issue?.reviewer?.username} />
            <DetailRow
              label={
                issue?.status === "rejected"
                  ? "Rejection Notes"
                  : "Review Notes"
              }
              value={issue?.reviewNotes}
            />
          </>
        )}

        {issue?.resolvedAt && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <DetailRow label="Resolution Notes" value={issue?.resolverNotes} />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="ghost" onClick={onClose} size="small">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
