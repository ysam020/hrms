import { useContext, useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@web/shared/components/Button";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import CircularProgress from "@mui/material/CircularProgress";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import StatusTimeline from "@web/shared/components/StatusTimeline";
import { FeedbackTab } from "./exit-management/FeedbackTab";
import { ChecklistTab } from "./exit-management/ChecklistTab";
import { SettlementTab } from "./exit-management/SettlementTab";
import { NoticeHistoryTab } from "./exit-management/NoticeHistoryTab";
import { RehireTab } from "./exit-management/RehireTab";
import { buildResignationStages } from "./exit-management/helpers";
import type {
  ChecklistItem,
  ExitManagementDialogProps,
  FnfSettlement,
  NoticeEvent,
} from "./exit-management/types";

export default function ExitManagementDialog({
  open,
  resignationId,
  employeeName,
  rehireEligible: initialRehireEligible,
  status,
  submittedOn,
  approvedOn,
  rejectedOn,
  withdrawnOn,
  relievedFromDutyOn,
  canManage = true,
  reason,
  overallJobSatisfaction,
  qualityOfCommunication,
  supportFromManager,
  appreciationForWork,
  collaborationWithinTheTeam,
  overallCompanyCulture,
  suggestions,
  onClose,
}: ExitManagementDialogProps) {
  const { setAlert } = useContext(AlertContext);
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [noticeEvents, setNoticeEvents] = useState<NoticeEvent[]>([]);
  const [settlement, setSettlement] = useState<FnfSettlement | null>(null);
  const [rehireEligible, setRehireEligible] = useState<boolean | null>(
    initialRehireEligible ?? null,
  );

  const [newLastWorkingDay, setNewLastWorkingDay] = useState("");
  const [renegotiateReason, setRenegotiateReason] = useState("");
  const [renegotiating, setRenegotiating] = useState(false);
  const [computingSettlement, setComputingSettlement] = useState(false);

  async function fetchAll() {
    if (!resignationId) return;
    setLoading(true);
    try {
      const [checklistRes, eventsRes, settlementRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.GET_RESIGNATION_CHECKLIST(resignationId)),
        apiClient.get(API_ENDPOINTS.RESIGNATION_NOTICE_EVENTS(resignationId)),
        apiClient.get(API_ENDPOINTS.COMPUTE_FNF_SETTLEMENT(resignationId)),
      ]);
      setChecklist(checklistRes.data?.data ?? []);
      setNoticeEvents(eventsRes.data?.data ?? []);
      setSettlement(settlementRes.data?.data ?? null);
    } catch {
      // Non-critical for the first paint — user can retry via tab switch.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Reset per-resignation state so switching between employees (or
    // reopening the dialog) never shows a stale settlement/checklist from
    // whoever was viewed previously.
    setSettlement(null);
    setChecklist([]);
    setNoticeEvents([]);
    setRehireEligible(initialRehireEligible ?? null);
    // Viewers without manage access only ever see the read-only Feedback
    // tab, so skip fetching data they can't act on.
    if (open && canManage) fetchAll();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resignationId, canManage]);

  async function toggleChecklistItem(item: ChecklistItem) {
    if (!resignationId) return;
    try {
      await apiClient.put(
        API_ENDPOINTS.UPDATE_RESIGNATION_CHECKLIST_ITEM(
          resignationId,
          item.itemDefId,
        ),
        { isComplete: !item.isComplete },
      );
      setChecklist((prev) =>
        prev.map((c) =>
          c.itemDefId === item.itemDefId
            ? { ...c, isComplete: !c.isComplete }
            : c,
        ),
      );
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to update checklist item.",
        severity: "error",
      });
    }
  }

  async function submitRenegotiation() {
    if (!resignationId || !newLastWorkingDay) return;
    setRenegotiating(true);
    try {
      await apiClient.put(API_ENDPOINTS.RENEGOTIATE_NOTICE(resignationId), {
        newLastWorkingDay,
        reason: renegotiateReason || undefined,
      });
      setAlert({
        open: true,
        message: "Last working day updated.",
        severity: "success",
      });
      setNewLastWorkingDay("");
      setRenegotiateReason("");
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to update notice period.",
        severity: "error",
      });
    } finally {
      setRenegotiating(false);
    }
  }

  async function computeSettlement() {
    if (!resignationId) return;
    setComputingSettlement(true);
    try {
      const res = await apiClient.post(
        API_ENDPOINTS.COMPUTE_FNF_SETTLEMENT(resignationId),
      );
      setSettlement(res.data?.data ?? null);
      setAlert({
        open: true,
        message: "Settlement computed.",
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to compute settlement.",
        severity: "error",
      });
    } finally {
      setComputingSettlement(false);
    }
  }

  async function approveSettlement() {
    if (!resignationId) return;
    try {
      const res = await apiClient.put(
        API_ENDPOINTS.APPROVE_FNF_SETTLEMENT(resignationId),
      );
      setSettlement(res.data?.data ?? null);
      setAlert({
        open: true,
        message: "Settlement approved.",
        severity: "success",
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to approve settlement.",
        severity: "error",
      });
    }
  }

  async function toggleRehireEligible(value: boolean) {
    if (!resignationId) return;
    setRehireEligible(value);
    try {
      await apiClient.put(API_ENDPOINTS.SET_REHIRE_ELIGIBILITY(resignationId), {
        rehireEligible: value,
      });
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ??
          "Failed to update rehire eligibility.",
        severity: "error",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      TransitionComponent={SlideUpTransition}
    >
      <DialogTitle>
        Manage exit{employeeName ? ` — ${employeeName}` : ""}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Box sx={{ mb: 2, overflowX: "auto" }}>
          <StatusTimeline
            orientation="horizontal"
            stages={buildResignationStages({
              status,
              submittedOn,
              approvedOn,
              rejectedOn,
              withdrawnOn,
              relievedFromDutyOn,
            })}
          />
        </Box>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label="Feedback" />
          {canManage && <Tab label="Checklist" />}
          {canManage && <Tab label="Final Settlement" />}
          {canManage && <Tab label="Notice History" />}
          {canManage && <Tab label="Rehire" />}
        </Tabs>

        {tab === 0 && (
          <FeedbackTab
            overallJobSatisfaction={overallJobSatisfaction}
            reason={reason}
            qualityOfCommunication={qualityOfCommunication}
            supportFromManager={supportFromManager}
            appreciationForWork={appreciationForWork}
            collaborationWithinTheTeam={collaborationWithinTheTeam}
            overallCompanyCulture={overallCompanyCulture}
            suggestions={suggestions}
          />
        )}

        {canManage && loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {tab === 1 && (
              <ChecklistTab
                checklist={checklist}
                onToggle={toggleChecklistItem}
              />
            )}

            {tab === 2 && (
              <SettlementTab
                settlement={settlement}
                computingSettlement={computingSettlement}
                onCompute={computeSettlement}
                onApprove={approveSettlement}
              />
            )}

            {tab === 3 && (
              <NoticeHistoryTab
                noticeEvents={noticeEvents}
                newLastWorkingDay={newLastWorkingDay}
                setNewLastWorkingDay={setNewLastWorkingDay}
                renegotiateReason={renegotiateReason}
                setRenegotiateReason={setRenegotiateReason}
                renegotiating={renegotiating}
                onSubmit={submitRenegotiation}
              />
            )}

            {tab === 4 && (
              <RehireTab
                rehireEligible={rehireEligible}
                onToggle={toggleRehireEligible}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="primary"
          size="small"
          onClick={onClose}
          style={{ marginTop: 0 }}
        >
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
