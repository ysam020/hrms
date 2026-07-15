export type ApprovalModule =
  | "leave"
  | "resignation"
  | "wfh"
  | "salary_advance"
  | "overtime"
  | "performance_review";

export type ApprovalDecision = "approved" | "rejected";

export type ConditionOp = "gte" | "lte" | "eq" | "in";

/** Arbitrary fields evaluated against a chain's condition, e.g. { days: 6 }. */
export type ApprovalContext = Record<string, unknown>;

export interface InstantiateApprovalResult {
  instanceId: string;
  /** The user who must act on the first (current) step. */
  firstApproverId: string;
  usedDefaultChain: boolean;
}

export interface ActOnStepResult {
  instanceId: string;
  decision: ApprovalDecision;
  /** True when this decision resolved the instance (approved-through-final-step or rejected). */
  isFinal: boolean;
  /** Final outcome once isFinal is true; undefined while more steps remain. */
  finalStatus?: "approved" | "rejected";
  /** The approver for the newly-activated step, if the chain advanced instead of finishing. */
  nextApproverId?: string;
}

export interface PendingApproval {
  instanceId: string;
  module: string;
  entityId: string;
  stepOrder: number;
}
