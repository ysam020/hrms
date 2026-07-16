import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@web/shared/components/Button";
import DataList from "@web/shared/components/DataList";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid2";
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
import { EMPTY_SLAB_FORM, type PtSlab, type TabSectionProps } from "./types";

export function PtSlabsTab({
  slabs,
  canEdit,
  onRefetch,
  setAlert,
}: TabSectionProps & { slabs: PtSlab[] }) {
  const {
    dialogOpen: slabDialogOpen,
    setDialogOpen: setSlabDialogOpen,
    editing: editingSlab,
    form: slabForm,
    setForm: setSlabForm,
    saving: savingSlab,
    deleteTarget: deleteSlabTarget,
    setDeleteTarget: setDeleteSlabTarget,
    openAdd: openAddSlab,
    openEdit: openEditSlab,
    save: saveSlab,
    confirmDelete: confirmDeleteSlab,
  } = useCrudDialog<
    PtSlab,
    typeof EMPTY_SLAB_FORM,
    {
      state: string;
      minGross: number;
      maxGross: number | undefined;
      monthlyPT: number;
    }
  >({
    emptyForm: EMPTY_SLAB_FORM,
    toForm: (s) => ({
      state: s.state,
      minGross: s.minGross,
      maxGross: s.maxGross ?? "",
      monthlyPT: s.monthlyPT,
    }),
    buildPayload: (f) => ({
      state: f.state,
      minGross: f.minGross,
      maxGross: f.maxGross === "" ? undefined : Number(f.maxGross),
      monthlyPT: f.monthlyPT,
    }),
    getId: (s) => s.id,
    create: (payload) => apiClient.post(API_ENDPOINTS.CREATE_PT_SLAB, payload),
    update: (id, payload) =>
      apiClient.put(API_ENDPOINTS.UPDATE_PT_SLAB(id), payload),
    remove: (id) => apiClient.delete(API_ENDPOINTS.DELETE_PT_SLAB(id)),
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
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        {canEdit && (
          <Button
            variant="primary"
            size="small"
            icon={<AddCircleOutlineIcon />}
            onClick={openAddSlab}
          >
            Add slab
          </Button>
        )}
      </Box>
      {slabs.length === 0 ? (
        <Alert severity="info">
          No state-wise slabs configured — Professional Tax uses a flat
          approximate slab for every employee.
        </Alert>
      ) : (
        <DataList
          ariaLabel="Professional tax slabs"
          variant="rows"
          data={slabs}
          getRowId={(s) => s.id}
          columns={[
            { key: "state", label: "State" },
            {
              key: "grossRange",
              label: "Gross range",
              render: (s) =>
                `₹${s.minGross} – ${s.maxGross != null ? `₹${s.maxGross}` : "∞"}`,
            },
            {
              key: "monthlyPT",
              label: "Monthly PT",
              render: (s) => `₹${s.monthlyPT}`,
            },
          ]}
          actions={
            canEdit
              ? (s) => [
                  {
                    icon: <EditIcon fontSize="small" />,
                    label: "Edit",
                    onClick: () => openEditSlab(s),
                  },
                  {
                    icon: <DeleteIcon fontSize="small" />,
                    label: "Remove",
                    color: "error" as const,
                    onClick: () => setDeleteSlabTarget(s),
                  },
                ]
              : undefined
          }
        />
      )}

      <Dialog
        open={slabDialogOpen}
        onClose={() => setSlabDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingSlab ? "Edit PT slab" : "Add PT slab"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="State"
            size="small"
            fullWidth
            placeholder="Karnataka"
            value={slabForm.state}
            onChange={(e) =>
              setSlabForm((f) => ({ ...f, state: e.target.value }))
            }
          />
          <Grid container spacing={2}>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Min gross",
                slabForm.minGross,
                (v) => setSlabForm((f) => ({ ...f, minGross: v })),
                { min: 0, suffix: "₹" },
              )}
            </Grid>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Max gross",
                slabForm.maxGross === "" ? 0 : Number(slabForm.maxGross),
                (v) => setSlabForm((f) => ({ ...f, maxGross: v })),
                { min: 0, suffix: "₹", helperText: "0 = no upper bound" },
              )}
            </Grid>
            <Grid size={{ xs: 4 }}>
              {numField(
                "Monthly PT",
                slabForm.monthlyPT,
                (v) => setSlabForm((f) => ({ ...f, monthlyPT: v })),
                { min: 0, suffix: "₹" },
              )}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setSlabDialogOpen(false)}
            disabled={savingSlab}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={saveSlab}
            disabled={savingSlab || !slabForm.state.trim()}
            loading={savingSlab}
            loadingText="Saving…"
            icon={<SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteSlabTarget}
        onClose={() => setDeleteSlabTarget(null)}
        onConfirm={confirmDeleteSlab}
        title="Remove slab?"
        message={`This ${deleteSlabTarget?.state} slab will no longer apply.`}
        variant="danger"
      />
    </Box>
  );
}
