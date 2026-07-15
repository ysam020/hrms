import { useContext, useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@web/shared/components/Button";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";
import Rating from "@mui/material/Rating";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import dayjs from "dayjs";
import StatusTimeline, {
  type TimelineStage,
} from "@web/shared/components/StatusTimeline";

function buildResignationStages(resignation: {
  status?: string;
  submittedOn?: string;
  approvedOn?: string;
  rejectedOn?: string;
  withdrawnOn?: string;
  relievedFromDutyOn?: string;
}): TimelineStage[] {
  const {
    status,
    submittedOn,
    approvedOn,
    rejectedOn,
    withdrawnOn,
    relievedFromDutyOn,
  } = resignation;
  const stages: TimelineStage[] = [
    { label: "Submitted", date: submittedOn, state: "done" },
  ];

  if (status === "Withdrawn") {
    stages.push({ label: "Withdrawn", date: withdrawnOn, state: "done" });
    return stages;
  }

  stages.push(
    rejectedOn
      ? { label: "Rejected", date: rejectedOn, state: "rejected" }
      : {
          label: "Approved",
          date: approvedOn || undefined,
          state: approvedOn ? "done" : "pending",
        },
  );

  if (status !== "Rejected") {
    stages.push({
      label: "Relieved",
      date: relievedFromDutyOn || undefined,
      state: relievedFromDutyOn ? "done" : "pending",
    });
  }

  return stages;
}

interface ChecklistItem {
  itemDefId: string;
  label: string;
  owningRole: string;
  isRequired: boolean;
  isComplete: boolean;
  notes: string | null;
}

interface NoticeEvent {
  id: string;
  previousLastWorkingDay: string | null;
  newLastWorkingDay: string;
  reason: string | null;
  createdAt: string;
}

interface FnfSettlement {
  id: string;
  lineItems: { label: string; type: string; amount: number }[];
  netPayable: number;
  status: string;
}

interface Props {
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

function FeedbackRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const display = value || "Not provided";
  return (
    <>
      <Box sx={{ py: 1.25 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: "text.secondary",
              minWidth: "160px",
              flexShrink: 0,
            }}
          >
            {label}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              textAlign: "right",
              color: value ? "text.primary" : "text.disabled",
              fontStyle: value ? "normal" : "italic",
              lineHeight: 1.4,
            }}
          >
            {display}
          </Typography>
        </Box>
      </Box>
      <Divider sx={{ opacity: 0.6 }} />
    </>
  );
}

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
}: Props) {
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
          <Box>
            <Box sx={{ py: 1.5, textAlign: "center" }}>
              <Typography
                variant="subtitle2"
                fontWeight={600}
                color="text.secondary"
                gutterBottom
              >
                Overall Job Satisfaction
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1.5,
                }}
              >
                <Rating value={overallJobSatisfaction || 0} readOnly />
                <Typography variant="h6" fontWeight={600} color="primary.main">
                  {overallJobSatisfaction || 0}/5
                </Typography>
              </Box>
            </Box>
            <Divider sx={{ my: 1 }} />
            <FeedbackRow label="Exit Reason" value={reason} />
            <FeedbackRow
              label="Quality of Communication"
              value={qualityOfCommunication}
            />
            <FeedbackRow label="Manager Support" value={supportFromManager} />
            <FeedbackRow
              label="Work Appreciation"
              value={appreciationForWork}
            />
            <FeedbackRow
              label="Team Collaboration"
              value={collaborationWithinTheTeam}
            />
            <FeedbackRow
              label="Company Culture"
              value={overallCompanyCulture}
            />
            <Box sx={{ py: 1.25 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 500, color: "text.secondary", mb: 0.5 }}
              >
                Suggestions
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  color: suggestions ? "text.primary" : "text.disabled",
                  fontStyle: suggestions ? "normal" : "italic",
                }}
              >
                {suggestions || "Not provided"}
              </Typography>
            </Box>
          </Box>
        )}

        {canManage && loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {tab === 1 && (
              <Box>
                {checklist.length === 0 ? (
                  <Alert severity="info">
                    No exit checklist configured yet. Add checklist items in
                    Settings → Exit Policy to track offboarding steps like
                    assets returned and FnF completion here.
                  </Alert>
                ) : (
                  checklist.map((item) => (
                    <FormControlLabel
                      key={item.itemDefId}
                      sx={{ display: "flex", width: "100%", ml: 0, mb: 0.5 }}
                      control={
                        <Checkbox
                          checked={item.isComplete}
                          onChange={() => toggleChecklistItem(item)}
                        />
                      }
                      label={
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Typography variant="body2">{item.label}</Typography>
                          <Chip
                            size="small"
                            label={item.owningRole}
                            variant="outlined"
                          />
                          {item.isRequired && (
                            <Chip
                              size="small"
                              label="Required"
                              color="warning"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      }
                    />
                  ))
                )}
              </Box>
            )}

            {tab === 2 && (
              <Box>
                <Button
                  variant="primary"
                  size="small"
                  onClick={computeSettlement}
                  disabled={computingSettlement}
                  loading={computingSettlement}
                  style={{ marginTop: 0, marginBottom: 16 }}
                >
                  {settlement ? "Recompute" : "Compute settlement"}
                </Button>
                {settlement && (
                  <Box>
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 0.5,
                      }}
                    >
                      {settlement.lineItems.map((li) => (
                        <Box
                          key={`${li.label}-${li.amount}`}
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            px: 2,
                            py: 1,
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 1,
                          }}
                        >
                          <Typography variant="body2">{li.label}</Typography>
                          <Typography variant="body2">
                            {li.type === "deduction" ? "-" : ""}₹
                            {li.amount.toFixed(2)}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        px: 2,
                        py: 1.25,
                        mt: 0.5,
                        border: "1px solid",
                        borderColor: "divider",
                        borderRadius: 2,
                      }}
                    >
                      <Typography sx={{ fontWeight: 700 }}>
                        Net payable
                      </Typography>
                      <Typography sx={{ fontWeight: 700 }}>
                        ₹{settlement.netPayable.toFixed(2)}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        mt: 2,
                      }}
                    >
                      <Chip
                        size="small"
                        label={settlement.status}
                        color={
                          settlement.status === "approved"
                            ? "success"
                            : "default"
                        }
                      />
                      {settlement.status === "draft" && (
                        <Button
                          size="small"
                          variant="primary"
                          onClick={approveSettlement}
                        >
                          Approve settlement
                        </Button>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {tab === 3 && (
              <Box>
                <Box
                  sx={{ display: "flex", gap: 1.5, mb: 2, flexWrap: "wrap" }}
                >
                  <TextField
                    label="New last working day"
                    type="date"
                    size="small"
                    slotProps={{ inputLabel: { shrink: true } }}
                    value={newLastWorkingDay}
                    onChange={(e) => setNewLastWorkingDay(e.target.value)}
                  />
                  <TextField
                    label="Reason (optional)"
                    size="small"
                    value={renegotiateReason}
                    onChange={(e) => setRenegotiateReason(e.target.value)}
                    sx={{ flex: 1, minWidth: 180 }}
                  />
                  <Button
                    variant="primary"
                    size="small"
                    onClick={submitRenegotiation}
                    disabled={renegotiating || !newLastWorkingDay}
                    style={{ marginTop: 0 }}
                  >
                    Update
                  </Button>
                </Box>
                {noticeEvents.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No renegotiations yet.
                  </Typography>
                ) : (
                  noticeEvents.map((ev) => (
                    <Box
                      key={ev.id}
                      sx={{
                        mb: 1,
                        pb: 1,
                        borderBottom: "1px solid",
                        borderColor: "divider",
                      }}
                    >
                      <Typography variant="body2">
                        {ev.previousLastWorkingDay
                          ? dayjs(ev.previousLastWorkingDay).format(
                              "DD MMM YYYY",
                            )
                          : "—"}
                        {" → "}
                        {dayjs(ev.newLastWorkingDay).format("DD MMM YYYY")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {ev.reason || "No reason given"} ·{" "}
                        {dayjs(ev.createdAt).format("DD MMM YYYY, h:mm A")}
                      </Typography>
                    </Box>
                  ))
                )}
              </Box>
            )}

            {tab === 4 && (
              <Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={!!rehireEligible}
                      onChange={(e) => toggleRehireEligible(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="body2">Eligible for rehire</Typography>
                  }
                />
              </Box>
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
