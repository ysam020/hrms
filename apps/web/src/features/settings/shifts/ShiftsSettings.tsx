import { useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid2";
import Switch from "@mui/material/Switch";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import DataList from "@web/shared/components/DataList";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import { numField } from "@web/shared/components/numField";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Shift {
  id: string;
  name: string;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  lateGracePeriodMinutes: number;
  fullDayMinHours: number;
  halfDayMinHours: number;
  isDefault: boolean;
  isActive: boolean;
}

const EMPTY_SHIFT_FORM = {
  name: "",
  startHour: 9,
  startMinute: 0,
  endHour: 18,
  endMinute: 0,
  lateGracePeriodMinutes: 30,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(h: number, m: number) {
  return `${pad(h)}:${pad(m)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ShiftsSettings() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  const canEdit =
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.some((p: string) => p.startsWith("OrgSettings:"));

  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const [shiftDialogOpen, setShiftDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [shiftForm, setShiftForm] = useState(EMPTY_SHIFT_FORM);
  const [savingShift, setSavingShift] = useState(false);
  const [deleteShiftTarget, setDeleteShiftTarget] = useState<Shift | null>(
    null,
  );

  async function fetchAll() {
    setLoading(true);
    try {
      const shiftsRes = await apiClient.get(API_ENDPOINTS.LIST_SHIFTS);
      setShifts(shiftsRes.data?.data ?? []);
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to load shifts.",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Shift handlers ───────────────────────────────────────────────────────────

  function openAddShift() {
    setEditingShift(null);
    setShiftForm(EMPTY_SHIFT_FORM);
    setShiftDialogOpen(true);
  }

  function openEditShift(s: Shift) {
    setEditingShift(s);
    setShiftForm({
      name: s.name,
      startHour: s.startHour,
      startMinute: s.startMinute,
      endHour: s.endHour,
      endMinute: s.endMinute,
      lateGracePeriodMinutes: s.lateGracePeriodMinutes,
      fullDayMinHours: s.fullDayMinHours,
      halfDayMinHours: s.halfDayMinHours,
    });
    setShiftDialogOpen(true);
  }

  async function saveShift() {
    setSavingShift(true);
    try {
      if (editingShift) {
        await apiClient.put(
          API_ENDPOINTS.UPDATE_SHIFT(editingShift.id),
          shiftForm,
        );
      } else {
        await apiClient.post(API_ENDPOINTS.CREATE_SHIFT, shiftForm);
      }
      setAlert({
        open: true,
        message: editingShift ? "Shift updated." : "Shift added.",
        severity: "success",
      });
      setShiftDialogOpen(false);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save shift.",
        severity: "error",
      });
    } finally {
      setSavingShift(false);
    }
  }

  async function toggleDefaultShift(s: Shift) {
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_SHIFT(s.id), {
        isDefault: !s.isDefault,
      });
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to update shift.",
        severity: "error",
      });
    }
  }

  async function confirmDeleteShift() {
    if (!deleteShiftTarget) return;
    try {
      await apiClient.delete(API_ENDPOINTS.DELETE_SHIFT(deleteShiftTarget.id));
      setAlert({ open: true, message: "Shift deactivated.", severity: "info" });
      setDeleteShiftTarget(null);
      await fetchAll();
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to deactivate shift.",
        severity: "error",
      });
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Shifts
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Define shifts for teams that don't work your default hours — day/night
          rotations, factory floor vs. office staff, and so on.
        </Typography>
      </Box>

      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner or admin to make changes.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ mb: 3, p: 3 }}>
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          {canEdit && (
            <Button
              variant="primary"
              size="small"
              icon={<AddCircleOutlineIcon />}
              onClick={openAddShift}
            >
              Add shift
            </Button>
          )}
        </Box>
        {shifts.length === 0 ? (
          <Alert severity="info">
            No shifts yet — everyone follows the default hours set in
            Organisation Settings → Attendance.
          </Alert>
        ) : (
          <DataList
            ariaLabel="Shifts"
            variant="rows"
            data={shifts}
            getRowId={(s: any) => s.id}
            actions={(s: any) => {
              if (!canEdit) return [];
              const acts = [
                {
                  icon: <EditIcon fontSize="small" />,
                  label: "Edit",
                  onClick: () => openEditShift(s),
                },
              ];
              if (s.isActive) {
                acts.push({
                  icon: <DeleteIcon fontSize="small" />,
                  label: "Deactivate",
                  onClick: () => setDeleteShiftTarget(s),
                });
              }
              return acts;
            }}
            columns={[
              { key: "name", label: "Name", primary: true },
              {
                key: "hours",
                label: "Hours",
                render: (s: any) =>
                  `${formatTime(s.startHour, s.startMinute)} – ${formatTime(s.endHour, s.endMinute)}`,
              },
              {
                key: "grace",
                label: "Grace period",
                render: (s: any) => `${s.lateGracePeriodMinutes} min`,
              },
              {
                key: "dayHours",
                label: "Full / half day",
                render: (s: any) =>
                  `${s.fullDayMinHours}h / ${s.halfDayMinHours}h`,
              },
              {
                key: "default",
                label: "Default",
                render: (s: any) => (
                  <Switch
                    size="small"
                    checked={s.isDefault}
                    disabled={!canEdit}
                    onChange={() => toggleDefaultShift(s)}
                  />
                ),
              },
              {
                key: "status",
                label: "Status",
                render: (s: any) => (
                  <Chip
                    label={s.isActive ? "Active" : "Inactive"}
                    size="small"
                    color={s.isActive ? "success" : "default"}
                  />
                ),
              },
            ]}
          />
        )}
      </Paper>

      {/* ── Shift dialog ── */}
      <Dialog
        open={shiftDialogOpen}
        onClose={() => setShiftDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>{editingShift ? "Edit shift" : "Add shift"}</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="Shift name"
            size="small"
            fullWidth
            autoFocus
            placeholder="e.g. Night Shift"
            value={shiftForm.name}
            onChange={(e) =>
              setShiftForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <Grid container spacing={2}>
            <Grid size={{ xs: 6, sm: 3 }}>
              {numField(
                "Start hour",
                shiftForm.startHour,
                (v) => setShiftForm((f) => ({ ...f, startHour: v })),
                { min: 0, max: 23 },
              )}
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              {numField(
                "Start min",
                shiftForm.startMinute,
                (v) => setShiftForm((f) => ({ ...f, startMinute: v })),
                { min: 0, max: 59 },
              )}
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              {numField(
                "End hour",
                shiftForm.endHour,
                (v) => setShiftForm((f) => ({ ...f, endHour: v })),
                { min: 0, max: 23 },
              )}
            </Grid>
            <Grid size={{ xs: 6, sm: 3 }}>
              {numField(
                "End min",
                shiftForm.endMinute,
                (v) => setShiftForm((f) => ({ ...f, endMinute: v })),
                { min: 0, max: 59 },
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              {numField(
                "Late grace",
                shiftForm.lateGracePeriodMinutes,
                (v) =>
                  setShiftForm((f) => ({ ...f, lateGracePeriodMinutes: v })),
                { min: 0, suffix: "min" },
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              {numField(
                "Full day",
                shiftForm.fullDayMinHours,
                (v) => setShiftForm((f) => ({ ...f, fullDayMinHours: v })),
                { min: 0.5, suffix: "hrs" },
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              {numField(
                "Half day",
                shiftForm.halfDayMinHours,
                (v) => setShiftForm((f) => ({ ...f, halfDayMinHours: v })),
                { min: 0.5, suffix: "hrs" },
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setShiftDialogOpen(false)}
            disabled={savingShift}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={saveShift}
            disabled={savingShift || !shiftForm.name}
            loading={savingShift}
            loadingText="Saving…"
            icon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteShiftTarget}
        onClose={() => setDeleteShiftTarget(null)}
        onConfirm={confirmDeleteShift}
        title="Deactivate shift?"
        message={`"${deleteShiftTarget?.name}" will no longer be assignable to employees or teams.`}
        variant="danger"
      />
    </Container>
  );
}
