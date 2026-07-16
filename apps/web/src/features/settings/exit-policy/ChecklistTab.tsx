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
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { useCrudDialog } from "@web/shared/hooks/useCrudDialog";
import {
  EMPTY_CHECKLIST_FORM,
  type ExitChecklistItemDef,
  type TabSectionProps,
} from "./types";

export function ChecklistTab({
  checklistDefs,
  canEdit,
  onRefetch,
  setAlert,
}: TabSectionProps & {
  checklistDefs: ExitChecklistItemDef[];
  onRefetch: () => Promise<void>;
}) {
  const {
    dialogOpen: checklistDialogOpen,
    setDialogOpen: setChecklistDialogOpen,
    editing: editingChecklistItem,
    form: checklistForm,
    setForm: setChecklistForm,
    saving: savingChecklistItem,
    deleteTarget: deleteChecklistTarget,
    setDeleteTarget: setDeleteChecklistTarget,
    openAdd,
    openEdit: openEditChecklistItem,
    save: saveChecklistItem,
    confirmDelete: confirmDeleteChecklistItem,
  } = useCrudDialog<ExitChecklistItemDef, typeof EMPTY_CHECKLIST_FORM>({
    emptyForm: EMPTY_CHECKLIST_FORM,
    toForm: (item) => ({
      label: item.label,
      owningRole: item.owningRole,
      isRequired: item.isRequired,
      order: item.order,
    }),
    getId: (item) => item.id,
    create: (payload) =>
      apiClient.post(API_ENDPOINTS.CREATE_EXIT_CHECKLIST_DEF, payload),
    update: (id, payload) =>
      apiClient.put(API_ENDPOINTS.UPDATE_EXIT_CHECKLIST_DEF(id), payload),
    remove: (id) =>
      apiClient.delete(API_ENDPOINTS.DELETE_EXIT_CHECKLIST_DEF(id)),
    onRefetch,
    setAlert,
    labels: {
      created: "Item added.",
      updated: "Item updated.",
      deleted: "Item removed.",
      saveFailed: "Failed to save item.",
      deleteFailed: "Failed to remove item.",
    },
  });

  // New items default to the end of the list — this is the one piece of
  // "add" behavior specific to this screen that the shared hook doesn't
  // know about, so it's layered on top rather than baked into the hook.
  function openAddChecklistItem() {
    openAdd();
    setChecklistForm((f) => ({ ...f, order: checklistDefs.length }));
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        {canEdit && (
          <Button
            variant="primary"
            size="small"
            icon={<AddCircleOutlineIcon />}
            onClick={openAddChecklistItem}
          >
            Add item
          </Button>
        )}
      </Box>
      {checklistDefs.length === 0 ? (
        <Alert severity="info">
          No checklist configured — the exit flow falls back to the two simple
          "Assets returned" / "FnF done" checkboxes.
        </Alert>
      ) : (
        <DataList
          ariaLabel="Exit checklist"
          variant="rows"
          data={checklistDefs.slice().sort((a, b) => a.order - b.order)}
          getRowId={(item: any) => item.id}
          actions={(item: any) =>
            canEdit
              ? [
                  {
                    icon: <EditIcon fontSize="small" />,
                    label: "Edit",
                    onClick: () => openEditChecklistItem(item),
                  },
                  {
                    icon: <DeleteIcon fontSize="small" />,
                    label: "Remove",
                    onClick: () => setDeleteChecklistTarget(item),
                  },
                ]
              : []
          }
          columns={[
            { key: "label", label: "Item", primary: true },
            {
              key: "owningRole",
              label: "Owner",
              render: (item: any) => (
                <Chip size="small" label={item.owningRole} variant="outlined" />
              ),
            },
            {
              key: "isRequired",
              label: "Required",
              render: (item: any) => (item.isRequired ? "Yes" : "No"),
            },
          ]}
        />
      )}

      <Dialog
        open={checklistDialogOpen}
        onClose={() => setChecklistDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingChecklistItem ? "Edit checklist item" : "Add checklist item"}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}
        >
          <TextField
            label="Item"
            size="small"
            fullWidth
            autoFocus
            placeholder="e.g. Return laptop"
            value={checklistForm.label}
            onChange={(e) =>
              setChecklistForm((f) => ({ ...f, label: e.target.value }))
            }
          />
          <FormControl fullWidth size="small">
            <InputLabel>Owning role</InputLabel>
            <Select
              label="Owning role"
              value={checklistForm.owningRole}
              onChange={(e) =>
                setChecklistForm((f) => ({ ...f, owningRole: e.target.value }))
              }
            >
              <MenuItem value="IT">IT</MenuItem>
              <MenuItem value="Finance">Finance</MenuItem>
              <MenuItem value="HR">HR</MenuItem>
              <MenuItem value="Admin">Admin</MenuItem>
              <MenuItem value="Manager">Manager</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            control={
              <Switch
                checked={checklistForm.isRequired}
                onChange={(e) =>
                  setChecklistForm((f) => ({
                    ...f,
                    isRequired: e.target.checked,
                  }))
                }
              />
            }
            label={
              <Typography variant="body2">
                Required before exit is complete
              </Typography>
            }
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setChecklistDialogOpen(false)}
            disabled={savingChecklistItem}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={saveChecklistItem}
            disabled={savingChecklistItem || !checklistForm.label.trim()}
            icon={<SaveIcon />}
            loading={savingChecklistItem}
            loadingText="Saving…"
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!deleteChecklistTarget}
        onClose={() => setDeleteChecklistTarget(null)}
        onConfirm={confirmDeleteChecklistItem}
        title="Remove checklist item?"
        message={`"${deleteChecklistTarget?.label}" will no longer appear on new exit checklists.`}
        variant="danger"
      />
    </Box>
  );
}
