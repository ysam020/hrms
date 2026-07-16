export interface ChecklistItem {
  itemDefId: string;
  label: string;
  owningRole: string;
  isRequired: boolean;
  isComplete: boolean;
  notes: string | null;
}

export interface NoticeEvent {
  id: string;
  previousLastWorkingDay: string | null;
  newLastWorkingDay: string;
  reason: string | null;
  createdAt: string;
}

export interface FnfSettlement {
  id: string;
  lineItems: { label: string; type: string; amount: number }[];
  netPayable: number;
  status: string;
}

export interface ExitManagementDialogProps {
  open: boolean;
  resignationId: string | null;
  employeeName?: string;
  rehireEligible?: boolean | null;
  status?: string;
  submittedOn?: string;
  approvedOn?: string;
  rejectedOn?: string;
  withdrawnOn?: string;
  relievedFromDutyOn?: string;
  // Only users who can manage the exit (checklist/settlement/rehire) see
  // those tabs — everyone else only sees the read-only Feedback tab, which
  // is what "View feedback" used to show on its own before the two dialogs
  // were merged into this one.
  canManage?: boolean;
  reason?: string;
  overallJobSatisfaction?: number;
  qualityOfCommunication?: string;
  supportFromManager?: string;
  appreciationForWork?: string;
  collaborationWithinTheTeam?: string;
  overallCompanyCulture?: string;
  suggestions?: string;
  onClose: () => void;
}
