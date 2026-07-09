import { useContext, useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import CircularProgress from "@mui/material/CircularProgress";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";

interface Props {
  open: boolean;
  mode: "approve" | "reject";
  resignationId: string | null;
  employeeName?: string;
  onClose: () => void;
  onDone: () => void;
}

export default function ResignationDecisionDialog({
  open,
  mode,
  resignationId,
  employeeName,
  onClose,
  onDone,
}: Props) {
  const { setAlert } = useContext(AlertContext);
  const [comments, setComments] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [noticePeriodWaived, setNoticePeriodWaived] = useState(false);
  const [buyoutAmount, setBuyoutAmount] = useState("");
  const [gardenLeave, setGardenLeave] = useState(false);
  const [relievedFromDutyOn, setRelievedFromDutyOn] = useState("");
  const [saving, setSaving] = useState(false);

  // Clear the form whenever a new resignation is opened — the dialog stays
  // mounted between opens, so without this a cancelled edit for one employee
  // would leak into the form for the next.
  useEffect(() => {
    if (open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resignationId]);

  function reset() {
    setComments("");
    setRejectionReason("");
    setLastWorkingDay("");
    setNoticePeriodWaived(false);
    setBuyoutAmount("");
    setGardenLeave(false);
    setRelievedFromDutyOn("");
  }

  async function submit() {
    if (!resignationId) return;
    setSaving(true);
    try {
      if (mode === "approve") {
        await apiClient.put(API_ENDPOINTS.APPROVE_RESIGNATION(resignationId), {
          comments: comments || undefined,
          lastWorkingDay: lastWorkingDay || undefined,
          noticePeriodWaived,
          buyoutAmount:
            noticePeriodWaived && buyoutAmount
              ? Number(buyoutAmount)
              : undefined,
          relievedFromDutyOn:
            gardenLeave && relievedFromDutyOn ? relievedFromDutyOn : undefined,
        });
        setAlert({
          open: true,
          message: "Resignation approved.",
          severity: "success",
        });
      } else {
        await apiClient.put(API_ENDPOINTS.REJECT_RESIGNATION(resignationId), {
          rejectionReason: rejectionReason || undefined,
          comments: comments || undefined,
        });
        setAlert({
          open: true,
          message: "Resignation rejected.",
          severity: "success",
        });
      }
      reset();
      onDone();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Something went wrong.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      TransitionComponent={SlideUpTransition}
    >
      <DialogTitle>
        {mode === "approve" ? "Approve resignation" : "Reject resignation"}
        {employeeName ? ` — ${employeeName}` : ""}
      </DialogTitle>
      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
      >
        {mode === "reject" && (
          <TextField
            label="Rejection reason"
            size="small"
            fullWidth
            multiline
            rows={2}
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        )}

        {mode === "approve" && (
          <>
            <TextField
              label="Last working day (optional — leave blank to keep the resolved notice-period date)"
              type="date"
              size="small"
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              value={lastWorkingDay}
              onChange={(e) => setLastWorkingDay(e.target.value)}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={noticePeriodWaived}
                  onChange={(e) => setNoticePeriodWaived(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">Waive notice period</Typography>
              }
            />
            {noticePeriodWaived && (
              <TextField
                label="Buyout amount (optional)"
                type="number"
                size="small"
                fullWidth
                value={buyoutAmount}
                onChange={(e) => setBuyoutAmount(e.target.value)}
              />
            )}

            <FormControlLabel
              control={
                <Switch
                  checked={gardenLeave}
                  onChange={(e) => setGardenLeave(e.target.checked)}
                />
              }
              label={
                <Box>
                  <Typography variant="body2">Garden leave</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Relieve from active duty immediately, but keep on payroll
                    through the notice period.
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start" }}
            />
            {gardenLeave && (
              <TextField
                label="Relieved from duty on"
                type="date"
                size="small"
                fullWidth
                slotProps={{ inputLabel: { shrink: true } }}
                value={relievedFromDutyOn}
                onChange={(e) => setRelievedFromDutyOn(e.target.value)}
              />
            )}
          </>
        )}

        <TextField
          label="Comments (optional)"
          size="small"
          fullWidth
          multiline
          rows={2}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={mode === "reject" ? "error" : "primary"}
          onClick={submit}
          disabled={saving}
          startIcon={
            saving ? <CircularProgress size={16} color="inherit" /> : undefined
          }
        >
          {saving ? "Saving…" : mode === "approve" ? "Approve" : "Reject"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
