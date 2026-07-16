import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@web/shared/components/Button";
import DataList from "@web/shared/components/DataList";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid2";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { numField } from "@web/shared/components/numField";
import { useCrudDialog } from "@web/shared/hooks/useCrudDialog";
import { EMPTY_CYCLE_FORM, type PayCycle, type TabSectionProps } from "./types";

export function PayCyclesTab({
  cycles,
  canEdit,
  onRefetch,
  setAlert,
}: TabSectionProps & { cycles: PayCycle[] }) {
  const {
    dialogOpen: cycleDialogOpen,
    setDialogOpen: setCycleDialogOpen,
    editing: editingCycle,
    form: cycleForm,
    setForm: setCycleForm,
    saving: savingCycle,
    deleteTarget: deleteCycleTarget,
    setDeleteTarget: setDeleteCycleTarget,
    openAdd: openAddCycle,
    openEdit: openEditCycle,
    save: saveCycle,
    confirmDelete: confirmDeleteCycle,
  } = useCrudDialog<PayCycle, typeof EMPTY_CYCLE_FORM>({
    emptyForm: EMPTY_CYCLE_FORM,
    toForm: (c) => ({
      name: c.name,
      frequency: c.frequency,
      payDay: c.payDay,
      isDefault: c.isDefault,
    }),
    getId: (c) => c.id,
    create: (payload) =>
      apiClient.post(API_ENDPOINTS.CREATE_PAY_CYCLE, payload),
    update: (id, payload) =>
      apiClient.put(API_ENDPOINTS.UPDATE_PAY_CYCLE(id), payload),
    remove: (id) => apiClient.delete(API_ENDPOINTS.DELETE_PAY_CYCLE(id)),
    onRefetch,
    setAlert,
    labels: {
      created: "Pay cycle added.",
      updated: "Pay cycle updated.",
      deleted: "Pay cycle removed.",
      saveFailed: "Failed to save pay cycle.",
      deleteFailed: "Failed to remove pay cycle.",
    },
  });

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        {canEdit && (
          <Button
            variant="primary"
            size="small"
            icon={<AddCircleOutlineIcon />}
            onClick={openAddCycle}
          >
            Add pay cycle
          </Button>
        )}
      </Box>
      {cycles.length === 0 ? (
        <Alert severity="info">
          No additional pay cycles — every employee is paid monthly.
        </Alert>
      ) : (
        <DataList
          ariaLabel="Pay cycles"
          variant="rows"
          data={cycles}
          getRowId={(c) => c.id}
          columns={[
            { key: "name", label: "Name" },
            { key: "frequency", label: "Frequency" },
            { key: "payDay", label: "Pay day" },
            {
              key: "isDefault",
              label: "Default",
              hideLabel: true,
              render: (c) =>
                c.isDefault ? (
                  <Chip size="small" label="Default" color="primary" />
                ) : null,
            },
          ]}
          actions={
            canEdit
              ? (c) => [
                  {
                    icon: <EditIcon fontSize="small" />,
                    label: "Edit",
                    onClick: () => openEditCycle(c),
                  },
                  {
                    icon: <DeleteIcon fontSize="small" />,
                    label: "Remove",
                    color: "error" as const,
                    onClick: () => setDeleteCycleTarget(c),
                  },
                ]
              : undefined
          }
        />
      )}

      <Dialog
        open={cycleDialogOpen}
        onClose={() => setCycleDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingCycle ? "Edit pay cycle" : "Add pay cycle"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="Name"
            size="small"
            fullWidth
            placeholder="Factory Floor - Biweekly"
            value={cycleForm.name}
            onChange={(e) =>
              setCycleForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Frequency</InputLabel>
                <Select
                  label="Frequency"
                  value={cycleForm.frequency}
                  onChange={(e) =>
                    setCycleForm((f) => ({
                      ...f,
                      frequency: e.target.value as PayCycle["frequency"],
                    }))
                  }
                >
                  <MenuItem value="monthly">Monthly</MenuItem>
                  <MenuItem value="biweekly">Bi-weekly</MenuItem>
                  <MenuItem value="weekly">Weekly</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6 }}>
              {numField(
                "Pay day",
                cycleForm.payDay,
                (v) => setCycleForm((f) => ({ ...f, payDay: v })),
                { min: 1, max: 31 },
              )}
            </Grid>
          </Grid>
          <FormControlLabel
            control={
              <Switch
                checked={cycleForm.isDefault}
                onChange={(e) =>
                  setCycleForm((f) => ({ ...f, isDefault: e.target.checked }))
                }
              />
            }
            label={<Typography variant="body2">Default cycle</Typography>}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setCycleDialogOpen(false)}
            disabled={savingCycle}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={saveCycle}
            disabled={savingCycle || !cycleForm.name.trim()}
            loading={savingCycle}
            loadingText="Saving…"
            icon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteCycleTarget}
        onClose={() => setDeleteCycleTarget(null)}
        onConfirm={confirmDeleteCycle}
        title="Remove pay cycle?"
        message={`"${deleteCycleTarget?.name}" will no longer be assignable.`}
        variant="danger"
      />
    </Box>
  );
}
