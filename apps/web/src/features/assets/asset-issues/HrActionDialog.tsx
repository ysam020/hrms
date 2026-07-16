import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";

export interface ActionDialogState {
  issueId: string;
  targetStatus: string;
  label: string;
  currentType: string;
}

export function HrActionDialog({
  actionDialog,
  onClose,
  notes,
  setNotes,
  actioning,
  onConfirm,
}: {
  actionDialog: ActionDialogState | null;
  onClose: () => void;
  notes: string;
  setNotes: (v: string) => void;
  actioning: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!actionDialog} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{actionDialog?.label} Issue</DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          pt: "16px !important",
        }}
      >
        {actionDialog?.targetStatus === "resolved" && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {actionDialog.currentType === "lost" ||
            actionDialog.currentType === "stolen"
              ? "⚠️ This will retire the asset."
              : actionDialog.currentType === "damage"
                ? "⚠️ This will move the asset to maintenance."
                : actionDialog.currentType === "return_request"
                  ? "⚠️ This will close the assignment and mark the asset as available."
                  : null}
          </Typography>
        )}
        <TextField
          label="Notes (optional)"
          size="small"
          multiline
          rows={3}
          fullWidth
          placeholder="Add any notes for this action…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="ghost" onClick={onClose} size="small">
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          variant={
            actionDialog?.targetStatus === "rejected" ? "danger" : "primary"
          }
          size="small"
          disabled={actioning}
        >
          {actioning ? "Saving…" : actionDialog?.label}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
