import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import Button from "@web/shared/components/Button";
import DataList from "@web/shared/components/DataList";
import Dialog from "@mui/material/Dialog";
import DialogTitleWithClose from "@web/shared/components/DialogTitleWithClose";
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
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";
import { numField } from "@web/shared/components/numField";
import { useCrudDialog } from "@web/shared/hooks/useCrudDialog";
import {
  EMPTY_COMPONENT_FORM,
  type SalaryComponent,
  type TabSectionProps,
} from "./types";

export function SalaryComponentsTab({
  components,
  canEdit,
  onRefetch,
  setAlert,
}: TabSectionProps & { components: SalaryComponent[] }) {
  const {
    dialogOpen: componentDialogOpen,
    setDialogOpen: setComponentDialogOpen,
    editing: editingComponent,
    form: componentForm,
    setForm: setComponentForm,
    saving: savingComponent,
    deleteTarget: deleteComponentTarget,
    setDeleteTarget: setDeleteComponentTarget,
    openAdd: openAddComponent,
    openEdit: openEditComponent,
    save: saveComponent,
    confirmDelete: confirmDeleteComponent,
  } = useCrudDialog<SalaryComponent, typeof EMPTY_COMPONENT_FORM>({
    emptyForm: EMPTY_COMPONENT_FORM,
    toForm: (c) => ({
      name: c.name,
      code: c.code,
      type: c.type,
      isTaxable: c.isTaxable,
      calcType: c.calcType,
      percentValue: c.percentValue ?? 0,
      isRecurring: c.isRecurring ?? true,
      displayOrder: c.displayOrder,
    }),
    getId: (c) => c.id,
    create: (payload) =>
      apiClient.post(API_ENDPOINTS.CREATE_SALARY_COMPONENT, payload),
    update: (id, payload) =>
      apiClient.put(API_ENDPOINTS.UPDATE_SALARY_COMPONENT(id), payload),
    remove: (id) => apiClient.delete(API_ENDPOINTS.DELETE_SALARY_COMPONENT(id)),
    onRefetch,
    setAlert,
    labels: {
      created: "Component added.",
      updated: "Component updated.",
      deleted: "Component removed.",
      saveFailed: "Failed to save component.",
      deleteFailed: "Failed to remove component.",
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
            onClick={openAddComponent}
          >
            Add component
          </Button>
        )}
      </Box>
      {components.length === 0 ? (
        <Alert severity="info">
          No custom components yet — every payslip uses the standard 7 fields.
        </Alert>
      ) : (
        <DataList
          ariaLabel="Salary components"
          variant="rows"
          data={components}
          getRowId={(c) => c.id}
          columns={[
            {
              key: "name",
              label: "Name",
              render: (c) => (
                <>
                  {c.name}
                  {c.isStatutory && (
                    <Chip
                      size="small"
                      label="Statutory"
                      sx={{ ml: 1 }}
                      variant="outlined"
                    />
                  )}
                  {c.type === "earning" && c.isRecurring === false && (
                    <Chip
                      size="small"
                      label="One-time"
                      sx={{ ml: 1 }}
                      variant="outlined"
                    />
                  )}
                </>
              ),
            },
            { key: "code", label: "Code" },
            {
              key: "type",
              label: "Type",
              render: (c) => (
                <Chip
                  size="small"
                  label={c.type}
                  color={c.type === "earning" ? "success" : "default"}
                  variant="outlined"
                />
              ),
            },
            {
              key: "calcType",
              label: "Calculation",
              render: (c) =>
                c.calcType === "percent_of_basic"
                  ? `${c.percentValue ?? 0}% of basic`
                  : c.calcType,
            },
          ]}
          actions={
            canEdit
              ? (c) => [
                  {
                    icon: <EditIcon fontSize="small" />,
                    label: "Edit",
                    onClick: () => openEditComponent(c),
                  },
                  ...(c.isStatutory
                    ? []
                    : [
                        {
                          icon: <DeleteIcon fontSize="small" />,
                          label: "Remove",
                          color: "error" as const,
                          onClick: () => setDeleteComponentTarget(c),
                        },
                      ]),
                ]
              : undefined
          }
        />
      )}

      <Dialog
        open={componentDialogOpen}
        onClose={ignoreBackdropClick(() => setComponentDialogOpen(false))}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitleWithClose onClose={() => setComponentDialogOpen(false)}>
          {editingComponent ? "Edit component" : "Add component"}
        </DialogTitleWithClose>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 7 }}>
              <TextField
                label="Name"
                size="small"
                fullWidth
                placeholder="Special Allowance"
                value={componentForm.name}
                onChange={(e) =>
                  setComponentForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField
                label="Code"
                size="small"
                fullWidth
                placeholder="SPECIAL_ALLOWANCE"
                inputProps={{ style: { textTransform: "uppercase" } }}
                value={componentForm.code}
                onChange={(e) =>
                  setComponentForm((f) => ({
                    ...f,
                    code: e.target.value.toUpperCase(),
                  }))
                }
              />
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Type</InputLabel>
                <Select
                  label="Type"
                  value={componentForm.type}
                  onChange={(e) =>
                    setComponentForm((f) => ({
                      ...f,
                      type: e.target.value as "earning" | "deduction",
                    }))
                  }
                >
                  <MenuItem value="earning">Earning</MenuItem>
                  <MenuItem value="deduction">Deduction</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Calculation</InputLabel>
                <Select
                  label="Calculation"
                  value={componentForm.calcType}
                  onChange={(e) =>
                    setComponentForm((f) => ({
                      ...f,
                      calcType: e.target.value as typeof f.calcType,
                    }))
                  }
                >
                  <MenuItem value="fixed">Fixed amount</MenuItem>
                  <MenuItem value="percent_of_basic">% of basic</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          {componentForm.calcType === "percent_of_basic" &&
            numField(
              "Percent of basic",
              componentForm.percentValue,
              (v) => setComponentForm((f) => ({ ...f, percentValue: v })),
              { min: 0, max: 100, suffix: "%" },
            )}
          <FormControlLabel
            control={
              <Switch
                checked={componentForm.isTaxable}
                onChange={(e) =>
                  setComponentForm((f) => ({
                    ...f,
                    isTaxable: e.target.checked,
                  }))
                }
              />
            }
            label={<Typography variant="body2">Taxable</Typography>}
          />
          {componentForm.type === "earning" && (
            <FormControlLabel
              control={
                <Switch
                  checked={componentForm.isRecurring}
                  onChange={(e) =>
                    setComponentForm((f) => ({
                      ...f,
                      isRecurring: e.target.checked,
                    }))
                  }
                />
              }
              label={
                <Typography variant="body2">
                  Recurring (projects forward on the TDS worksheet — turn off
                  for one-time payments like a bonus)
                </Typography>
              }
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setComponentDialogOpen(false)}
            disabled={savingComponent}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={saveComponent}
            disabled={
              savingComponent ||
              !componentForm.name.trim() ||
              !componentForm.code.trim()
            }
            loading={savingComponent}
            loadingText="Saving…"
            icon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteComponentTarget}
        onClose={() => setDeleteComponentTarget(null)}
        onConfirm={confirmDeleteComponent}
        title="Remove component?"
        message={`"${deleteComponentTarget?.name}" will no longer appear on new payslips.`}
        variant="danger"
      />
    </Box>
  );
}
