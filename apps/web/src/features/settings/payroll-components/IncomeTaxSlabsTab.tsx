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
  EMPTY_TAX_SLAB_FORM,
  type IncomeTaxSlab,
  type TabSectionProps,
} from "./types";

export function IncomeTaxSlabsTab({
  taxSlabs,
  canEdit,
  onRefetch,
  setAlert,
}: TabSectionProps & { taxSlabs: IncomeTaxSlab[] }) {
  const {
    dialogOpen: taxSlabDialogOpen,
    setDialogOpen: setTaxSlabDialogOpen,
    editing: editingTaxSlab,
    form: taxSlabForm,
    setForm: setTaxSlabForm,
    saving: savingTaxSlab,
    deleteTarget: deleteTaxSlabTarget,
    setDeleteTarget: setDeleteTaxSlabTarget,
    openAdd: openAddTaxSlab,
    openEdit: openEditTaxSlab,
    save: saveTaxSlab,
    confirmDelete: confirmDeleteTaxSlab,
  } = useCrudDialog<
    IncomeTaxSlab,
    typeof EMPTY_TAX_SLAB_FORM,
    {
      financialYear: string;
      regime: "old" | "new";
      minIncome: number;
      maxIncome: number | undefined;
      ratePercent: number;
    }
  >({
    emptyForm: EMPTY_TAX_SLAB_FORM,
    toForm: (s) => ({
      financialYear: s.financialYear,
      regime: s.regime,
      minIncome: s.minIncome,
      maxIncome: s.maxIncome ?? "",
      ratePercent: s.ratePercent,
    }),
    buildPayload: (f) => ({
      financialYear: f.financialYear,
      regime: f.regime,
      minIncome: f.minIncome,
      maxIncome: f.maxIncome === "" ? undefined : Number(f.maxIncome),
      ratePercent: f.ratePercent,
    }),
    getId: (s) => s.id,
    create: (payload) => apiClient.post(API_ENDPOINTS.CREATE_TDS_SLAB, payload),
    update: (id, payload) =>
      apiClient.put(API_ENDPOINTS.UPDATE_TDS_SLAB(id), payload),
    remove: (id) => apiClient.delete(API_ENDPOINTS.DELETE_TDS_SLAB(id)),
    onRefetch,
    setAlert,
    labels: {
      created: "Slab added.",
      updated: "Slab updated.",
      deleted: "Slab removed.",
      saveFailed: "Failed to save slab.",
      deleteFailed: "Failed to remove slab.",
    },
  });

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Income tax (TDS) slabs change almost every Union Budget — add a row per
        bracket for each regime and financial year. Without any rows configured,
        TDS falls back to the last confirmed slabs (FY2025-26).
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        {canEdit && (
          <Button
            variant="primary"
            size="small"
            icon={<AddCircleOutlineIcon />}
            onClick={openAddTaxSlab}
          >
            Add slab
          </Button>
        )}
      </Box>
      {taxSlabs.length === 0 ? (
        <Alert severity="info">
          No Income Tax slabs configured — TDS uses the FY2025-26 fallback slabs
          for both regimes.
        </Alert>
      ) : (
        <DataList
          ariaLabel="Income tax slabs"
          variant="rows"
          data={taxSlabs}
          getRowId={(s) => s.id}
          columns={[
            { key: "financialYear", label: "FY" },
            {
              key: "regime",
              label: "Regime",
              render: (s) => (
                <Chip
                  size="small"
                  label={s.regime === "new" ? "New Regime" : "Old Regime"}
                  color={s.regime === "new" ? "primary" : "default"}
                  variant="outlined"
                />
              ),
            },
            {
              key: "incomeRange",
              label: "Income range",
              render: (s) =>
                `₹${s.minIncome} – ${s.maxIncome != null ? `₹${s.maxIncome}` : "∞"}`,
            },
            {
              key: "ratePercent",
              label: "Rate",
              render: (s) => `${s.ratePercent}%`,
            },
          ]}
          actions={
            canEdit
              ? (s) => [
                  {
                    icon: <EditIcon fontSize="small" />,
                    label: "Edit",
                    onClick: () => openEditTaxSlab(s),
                  },
                  {
                    icon: <DeleteIcon fontSize="small" />,
                    label: "Remove",
                    color: "error" as const,
                    onClick: () => setDeleteTaxSlabTarget(s),
                  },
                ]
              : undefined
          }
        />
      )}

      <Dialog
        open={taxSlabDialogOpen}
        onClose={ignoreBackdropClick(() => setTaxSlabDialogOpen(false))}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitleWithClose onClose={() => setTaxSlabDialogOpen(false)}>
          {editingTaxSlab ? "Edit Income Tax slab" : "Add Income Tax slab"}
        </DialogTitleWithClose>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <TextField
                label="Financial year"
                size="small"
                fullWidth
                placeholder="2025-26"
                value={taxSlabForm.financialYear}
                onChange={(e) =>
                  setTaxSlabForm((f) => ({
                    ...f,
                    financialYear: e.target.value,
                  }))
                }
              />
            </Grid>
            <Grid size={{ xs: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Regime</InputLabel>
                <Select
                  label="Regime"
                  value={taxSlabForm.regime}
                  onChange={(e) =>
                    setTaxSlabForm((f) => ({
                      ...f,
                      regime: e.target.value as "old" | "new",
                    }))
                  }
                >
                  <MenuItem value="new">New Regime</MenuItem>
                  <MenuItem value="old">Old Regime</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Grid container spacing={2}>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Min income",
                taxSlabForm.minIncome,
                (v) => setTaxSlabForm((f) => ({ ...f, minIncome: v })),
                { min: 0, suffix: "₹" },
              )}
            </Grid>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Max income",
                taxSlabForm.maxIncome === ""
                  ? 0
                  : Number(taxSlabForm.maxIncome),
                (v) => setTaxSlabForm((f) => ({ ...f, maxIncome: v })),
                { min: 0, suffix: "₹", helperText: "0 = no upper bound" },
              )}
            </Grid>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Rate",
                taxSlabForm.ratePercent,
                (v) => setTaxSlabForm((f) => ({ ...f, ratePercent: v })),
                { min: 0, max: 100, suffix: "%" },
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setTaxSlabDialogOpen(false)}
            disabled={savingTaxSlab}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={saveTaxSlab}
            disabled={savingTaxSlab || !taxSlabForm.financialYear.trim()}
            loading={savingTaxSlab}
            loadingText="Saving…"
            icon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteTaxSlabTarget}
        onClose={() => setDeleteTaxSlabTarget(null)}
        onConfirm={confirmDeleteTaxSlab}
        title="Remove slab?"
        message={`This ${deleteTaxSlabTarget?.financialYear} ${deleteTaxSlabTarget?.regime === "new" ? "New" : "Old"} Regime slab will no longer apply.`}
        variant="danger"
      />
    </Box>
  );
}
