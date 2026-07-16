import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Box from "@mui/material/Box";
import Button from "@web/shared/components/Button";
import { ISSUE_TYPES, PRIORITIES } from "./constants";

export interface ReportForm {
  assetId: string;
  type: string;
  priority: string;
  title: string;
  description: string;
}

export function ReportIssueDialog({
  open,
  onClose,
  form,
  setForm,
  myAssets,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  form: ReportForm;
  setForm: (update: (f: ReportForm) => ReportForm) => void;
  myAssets: { id: string; assetCode: string; name: string }[];
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Report Asset Issue</DialogTitle>
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
          label="Asset"
          size="small"
          fullWidth
          value={form.assetId}
          onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
          helperText="Only your currently assigned assets are shown"
        >
          {myAssets.length === 0 ? (
            <MenuItem disabled value="">
              No assets assigned to you
            </MenuItem>
          ) : (
            myAssets.map((a) => (
              <MenuItem key={a.id} value={a.id}>
                {a.assetCode} — {a.name}
              </MenuItem>
            ))
          )}
        </TextField>

        <Box sx={{ display: "flex", gap: 2 }}>
          <TextField
            select
            label="Issue Type"
            size="small"
            fullWidth
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
          >
            {ISSUE_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Priority"
            size="small"
            fullWidth
            value={form.priority}
            onChange={(e) =>
              setForm((f) => ({ ...f, priority: e.target.value }))
            }
          >
            {PRIORITIES.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <TextField
          label="Title"
          size="small"
          fullWidth
          placeholder="Brief summary of the issue"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />

        <TextField
          label="Description"
          size="small"
          multiline
          rows={3}
          fullWidth
          placeholder="Describe the issue in detail…"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
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
          disabled={
            submitting || !form.assetId || !form.title || !form.description
          }
        >
          {submitting ? "Submitting…" : "Submit"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
