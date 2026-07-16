import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
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
import {
  EMPTY_POLICY_FORM,
  type NoticePeriodPolicy,
  type TabSectionProps,
} from "./types";

export function NoticePeriodTab({
  policies,
  canEdit,
  onRefetch,
  setAlert,
}: TabSectionProps & {
  policies: NoticePeriodPolicy[];
  onRefetch: () => Promise<void>;
}) {
  const {
    dialogOpen: policyDialogOpen,
    setDialogOpen: setPolicyDialogOpen,
    editing: editingPolicy,
    form: policyForm,
    setForm: setPolicyForm,
    saving: savingPolicy,
    deleteTarget: deletePolicyTarget,
    setDeleteTarget: setDeletePolicyTarget,
    openAdd: openAddPolicy,
    openEdit: openEditPolicy,
    save: savePolicy,
    confirmDelete: confirmDeletePolicy,
  } = useCrudDialog<
    NoticePeriodPolicy,
    typeof EMPTY_POLICY_FORM,
    {
      minTenureMonths: number;
      maxTenureMonths: number | undefined;
      designation: string | undefined;
      department: string | undefined;
      noticePeriodDays: number;
      isProbationPolicy: boolean;
      priority: number;
    }
  >({
    emptyForm: EMPTY_POLICY_FORM,
    toForm: (p) => ({
      minTenureMonths: p.minTenureMonths,
      maxTenureMonths: p.maxTenureMonths ?? "",
      designation: p.designation ?? "",
      department: p.department ?? "",
      noticePeriodDays: p.noticePeriodDays,
      isProbationPolicy: p.isProbationPolicy,
      priority: p.priority,
    }),
    buildPayload: (f) => ({
      minTenureMonths: f.minTenureMonths,
      maxTenureMonths:
        f.maxTenureMonths === "" ? undefined : Number(f.maxTenureMonths),
      designation: f.designation || undefined,
      department: f.department || undefined,
      noticePeriodDays: f.noticePeriodDays,
      isProbationPolicy: f.isProbationPolicy,
      priority: f.priority,
    }),
    getId: (p) => p.id,
    create: (payload) =>
      apiClient.post(API_ENDPOINTS.CREATE_NOTICE_PERIOD_POLICY, payload),
    update: (id, payload) =>
      apiClient.put(API_ENDPOINTS.UPDATE_NOTICE_PERIOD_POLICY(id), payload),
    remove: (id) =>
      apiClient.delete(API_ENDPOINTS.DELETE_NOTICE_PERIOD_POLICY(id)),
    onRefetch,
    setAlert,
    labels: {
      created: "Policy added.",
      updated: "Policy updated.",
      deleted: "Policy deleted.",
      saveFailed: "Failed to save policy.",
      deleteFailed: "Failed to delete policy.",
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
            onClick={openAddPolicy}
          >
            Add band
          </Button>
        )}
      </Box>
      {policies.length === 0 ? (
        <Alert severity="info">
          No tenure bands yet — every resignation defaults to 30 days' notice.
          Add a band below with tenure/designation/department left blank to set
          a different default for everyone, or add specific bands to override it
          for particular groups.
        </Alert>
      ) : (
        <DataList
          ariaLabel="Notice period bands"
          variant="rows"
          data={policies}
          getRowId={(p: any) => p.id}
          actions={(p: any) =>
            canEdit
              ? [
                  {
                    icon: <EditIcon fontSize="small" />,
                    label: "Edit",
                    onClick: () => openEditPolicy(p),
                  },
                  {
                    icon: <DeleteIcon fontSize="small" />,
                    label: "Delete",
                    onClick: () => setDeletePolicyTarget(p),
                  },
                ]
              : []
          }
          columns={[
            {
              key: "appliesTo",
              label: "Applies to",
              primary: true,
              render: (p: any) =>
                p.designation || p.department
                  ? [p.designation, p.department].filter(Boolean).join(" · ")
                  : "Everyone",
            },
            {
              key: "tenure",
              label: "Tenure",
              render: (p: any) =>
                `${p.minTenureMonths}${p.maxTenureMonths != null ? `–${p.maxTenureMonths}` : "+"} months`,
            },
            {
              key: "notice",
              label: "Notice",
              render: (p: any) => `${p.noticePeriodDays} days`,
            },
            {
              key: "type",
              label: "Type",
              render: (p: any) =>
                p.isProbationPolicy && (
                  <Chip
                    size="small"
                    label="Probation"
                    color="primary"
                    variant="outlined"
                  />
                ),
            },
          ]}
        />
      )}

      <Dialog
        open={policyDialogOpen}
        onClose={() => setPolicyDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingPolicy ? "Edit notice period band" : "Add notice period band"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              {numField(
                "Min tenure",
                policyForm.minTenureMonths,
                (v) => setPolicyForm((f) => ({ ...f, minTenureMonths: v })),
                { min: 0, suffix: "months" },
              )}
            </Grid>
            <Grid size={{ xs: 6 }}>
              {numField(
                "Max tenure",
                policyForm.maxTenureMonths === ""
                  ? 0
                  : Number(policyForm.maxTenureMonths),
                (v) => setPolicyForm((f) => ({ ...f, maxTenureMonths: v })),
                { min: 0, suffix: "months", helperText: "0 = no upper bound" },
              )}
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Designation (optional)"
                size="small"
                fullWidth
                value={policyForm.designation}
                onChange={(e) =>
                  setPolicyForm((f) => ({ ...f, designation: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Department (optional)"
                size="small"
                fullWidth
                value={policyForm.department}
                onChange={(e) =>
                  setPolicyForm((f) => ({ ...f, department: e.target.value }))
                }
              />
            </Grid>
          </Grid>
          {numField(
            "Notice period",
            policyForm.noticePeriodDays,
            (v) => setPolicyForm((f) => ({ ...f, noticePeriodDays: v })),
            { min: 0, suffix: "days" },
          )}
          <FormControlLabel
            control={
              <Switch
                checked={policyForm.isProbationPolicy}
                onChange={(e) =>
                  setPolicyForm((f) => ({
                    ...f,
                    isProbationPolicy: e.target.checked,
                  }))
                }
              />
            }
            label={
              <Typography variant="body2">
                Applies only while still on probation
              </Typography>
            }
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setPolicyDialogOpen(false)}
            disabled={savingPolicy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={savePolicy}
            disabled={savingPolicy || !policyForm.noticePeriodDays}
            icon={<SaveIcon />}
            loading={savingPolicy}
            loadingText="Saving…"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deletePolicyTarget}
        onClose={() => setDeletePolicyTarget(null)}
        onConfirm={confirmDeletePolicy}
        title="Delete notice period band?"
        message="Resignations already submitted keep their resolved notice period — this only affects future submissions."
        variant="danger"
      />
    </Box>
  );
}
