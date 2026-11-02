import { startTransition, useContext, useOptimistic, useState } from "react";
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

type Mode = "approved" | "rejected";
type Decision = { item: PendingApprovalItem; mode: Mode; comment: string };

const NONE: ReadonlyMap<string, Mode> = new Map();

export function useDecision() {
  const { setAlert } = useContext(AlertContext);
  const { refetchPendingApprovals } = useContext(ApprovalsBadgeContext);
  const [decision, setDecision] = useState<Decision | null>(null);
  /** Rows the gateway confirmed as decided, hidden until the list refetches. */
  const [decided, setDecided] = useState<Set<string>>(new Set());
  // Decisions sent and not yet answered. The row stays, marked "Approving…"
  // with its actions disabled, so the next request can be decided meanwhile.
  // React drops these when each request settles: a confirmed one is then in
  // `decided`; a failed one shows its actions again.
  const [sending, markSending] = useOptimistic(
    NONE,
    (map, [id, mode]: [string, Mode]) => new Map(map).set(id, mode),
  );

  const close = () => setDecision(null);

  const submit = () => {
    if (!decision) return;
    const { item, mode, comment } = decision;
    close();
    startTransition(async () => {
      markSending([item.instanceId, mode]);
      try {
        await apiClient.put(API_ENDPOINTS.ACT_ON_APPROVAL(item.instanceId), {
          decision: mode,
          comment: comment || undefined,
        });
        startTransition(() =>
          setDecided((s) => new Set(s).add(item.instanceId)),
        );
        setAlert({
          open: true,
          message:
            mode === "approved" ? "Request approved." : "Request rejected.",
          severity: "success",
        });
        refetchPendingApprovals();
      } catch (err: any) {
        setAlert({ open: true, message: errorMessage(err), severity: "error" });
        const status = err?.response?.status ?? 0;
        if (status >= 400 && status < 500) {
          // Refused (already decided elsewhere, no longer the approver):
          // show the list as the gateway now has it.
          refetchPendingApprovals();
        } else {
          // Worth retrying: back to the dialog with the comment intact,
          // unless another one is open by now.
          setDecision((open) => open ?? decision);
        }
      }
    });
  };

  const approving = decision?.mode === "approved";
  const dialog = (
    <Dialog
      open={Boolean(decision)}
      onClose={close}
      title={approving ? "Approve Request" : "Reject Request"}
      description={decision?.item.summary}
      size="sm"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant={approving ? "primary" : "danger"} onClick={submit}>
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
          value={decision?.comment ?? ""}
          onChange={(e) =>
            setDecision((d) => d && { ...d, comment: e.target.value })
          }
          rows={3}
        />
      </Field>
    </Dialog>
  );

  return {
    approve: (item: PendingApprovalItem) =>
      setDecision({ item, mode: "approved", comment: "" }),
    reject: (item: PendingApprovalItem) =>
      setDecision({ item, mode: "rejected", comment: "" }),
    decided,
    sending,
    dialog,
  };
}
