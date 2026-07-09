import { useContext, useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
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
import DataList from "@web/shared/components/DataList";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import dayjs from "dayjs";

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
  onClose: () => void;
}

export default function ExitManagementDialog({
  open,
  resignationId,
  employeeName,
  rehireEligible: initialRehireEligible,
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
      const [checklistRes, eventsRes] = await Promise.all([
        apiClient.get(API_ENDPOINTS.GET_RESIGNATION_CHECKLIST(resignationId)),
        apiClient.get(API_ENDPOINTS.RESIGNATION_NOTICE_EVENTS(resignationId)),
      ]);
      setChecklist(checklistRes.data?.data ?? []);
      setNoticeEvents(eventsRes.data?.data ?? []);
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
    if (open) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resignationId]);

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
        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label="Checklist" />
          <Tab label="Final Settlement" />
          <Tab label="Notice History" />
          <Tab label="Rehire" />
        </Tabs>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <>
            {tab === 0 && (
              <Box>
                {checklist.length === 0 ? (
                  <Alert severity="info">
                    No exit checklist configured — using the simple Assets
                    Returned / FnF Done checkboxes in the table instead.
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

            {tab === 1 && (
              <Box>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={computeSettlement}
                  disabled={computingSettlement}
                  startIcon={
                    computingSettlement ? (
                      <CircularProgress size={14} />
                    ) : undefined
                  }
                  sx={{ mb: 2 }}
                >
                  {settlement ? "Recompute" : "Compute settlement"}
                </Button>
                {settlement && (
                  <Box>
                    <DataList
                      ariaLabel="Final settlement line items"
                      variant="rows"
                      data={settlement.lineItems}
                      getRowId={(li) => `${li.label}-${li.amount}`}
                      columns={[
                        {
                          key: "label",
                          label: "Line item",
                          primary: true,
                          hideLabel: true,
                        },
                        {
                          key: "amount",
                          label: "Amount",
                          hideLabel: true,
                          render: (li) =>
                            `${li.type === "deduction" ? "-" : ""}₹${li.amount.toFixed(2)}`,
                        },
                      ]}
                    />
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
                          variant="contained"
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

            {tab === 2 && (
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
                    variant="contained"
                    size="small"
                    onClick={submitRenegotiation}
                    disabled={renegotiating || !newLastWorkingDay}
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

            {tab === 3 && (
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
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
