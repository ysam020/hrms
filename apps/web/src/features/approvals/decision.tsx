import { useContext, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import {
  ApprovalsBadgeContext,
  type JoinRequestApprovalItem,
  type KycApprovalItem,
  type PendingApprovalItem,
} from "@web/app/providers/ApprovalsBadgeContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { Button, Dialog, Field, TextArea } from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";

// Same rules as Classic's ApprovalsInbox: chain-engine items (leave,
// resignation, overtime, WFH, salary advance) are decided inline through
// PUT /approvals/:instanceId; KYC and join requests click through to their
// dedicated review screens, which can have several eligible approvers.

export const MODULE_LABELS: Record<string, string> = {
  leave: "Leave",
  resignation: "Resignation",
  overtime: "Overtime",
  wfh: "WFH",
  salary_advance: "Salary Advance",
  kyc: "KYC",
  join_request: "Join Request",
};

export const isClickThrough = (
  item: PendingApprovalItem,
): item is KycApprovalItem | JoinRequestApprovalItem =>
  item.module === "kyc" || item.module === "join_request";

export const clickThroughPath = (
  item: KycApprovalItem | JoinRequestApprovalItem,
) =>
  item.module === "kyc"
    ? `/view-kyc/${item.username}`
    : "/settings?tab=join-requests";

type Decision = { item: PendingApprovalItem; mode: "approved" | "rejected" };

export function useDecision() {
  const { setAlert } = useContext(AlertContext);
  const { refetchPendingApprovals } = useContext(ApprovalsBadgeContext);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  /** Rows decided in this session, hidden immediately (optimistic). */
  const [decided, setDecided] = useState<Set<string>>(new Set());

  const close = () => {
    setDecision(null);
    setComment("");
  };

  const submit = async () => {
    if (!decision) return;
    setSaving(true);
    try {
      await apiClient.put(
        API_ENDPOINTS.ACT_ON_APPROVAL(decision.item.instanceId),
        {
          decision: decision.mode,
          comment: comment || undefined,
        },
      );
      setDecided((s) => new Set(s).add(decision.item.instanceId));
      setAlert({
        open: true,
        message:
          decision.mode === "approved"
            ? "Request approved."
            : "Request rejected.",
        severity: "success",
      });
      close();
      refetchPendingApprovals();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  const approving = decision?.mode === "approved";
  const dialog = (
    <Dialog
      open={Boolean(decision)}
      onClose={close}
      busy={saving}
      title={approving ? "Approve Request" : "Reject Request"}
      description={decision?.item.summary}
      size="sm"
      footer={
        <>
          <Button onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant={approving ? "primary" : "danger"}
            onClick={submit}
            busy={saving}
          >
            {approving ? "Approve" : "Reject"}
          </Button>
        </>
      }
    >
      <Field
        label="Comment"
        optional
        hint={approving ? undefined : "The requester will see this."}
      >
        <TextArea
          data-autofocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />
      </Field>
    </Dialog>
  );

  return {
    approve: (item: PendingApprovalItem) =>
      setDecision({ item, mode: "approved" }),
    reject: (item: PendingApprovalItem) =>
      setDecision({ item, mode: "rejected" }),
    decided,
    dialog,
  };
}
