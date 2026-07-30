import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitleWithClose from "@web/shared/components/DialogTitleWithClose";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";
import { CONDITION_OPTIONS } from "./constants";

export interface ReturnForm {
  conditionIn: string;
  notes: string;
}

export function ReturnAssetDialog({
  open,
  assetCode,
  onClose,
  form,
  setForm,
  submitting,
  onSubmit,
}: {
  open: boolean;
  assetCode: string | undefined;
  onClose: () => void;
  form: ReturnForm;
  setForm: (update: (f: ReturnForm) => ReturnForm) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={ignoreBackdropClick(onClose)}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitleWithClose onClose={onClose}>
        Return Asset {assetCode}
      </DialogTitleWithClose>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          pt: "16px !important",
        }}
      >
        <TextField
          select
          label="Condition In"
          size="small"
          fullWidth
          value={form.conditionIn}
          onChange={(e) =>
            setForm((f) => ({ ...f, conditionIn: e.target.value }))
          }
        >
          {CONDITION_OPTIONS.map((c) => (
            <MenuItem key={c.value} value={c.value}>
              {c.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Notes"
          size="small"
          multiline
          rows={2}
          fullWidth
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="ghost" onClick={onClose} size="small">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="primary"
          size="small"
          disabled={submitting}
        >
          {submitting ? "Processing…" : "Return"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
