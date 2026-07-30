import dayjs from "dayjs";
import { Calendar } from "primereact/calendar";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitleWithClose from "@web/shared/components/DialogTitleWithClose";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Grid from "@mui/material/Grid";
import Autocomplete from "@mui/material/Autocomplete";
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";

export interface CreateAssetForm {
  name: string;
  assetCode: string;
  category: string;
  notes: string;
  purchaseDate: string;
  purchaseValue: string;
}

export function CreateAssetDialog({
  open,
  onClose,
  form,
  setForm,
  categoryOptions,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  form: CreateAssetForm;
  setForm: (update: (f: CreateAssetForm) => CreateAssetForm) => void;
  categoryOptions: string[];
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={ignoreBackdropClick(onClose)}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitleWithClose onClose={onClose}>
        Add New Asset
      </DialogTitleWithClose>
      <DialogContent sx={{ pt: "16px !important" }}>
        <Grid container spacing={2}>
          <Grid item xs={6}>
            <TextField
              label="Asset Name"
              size="small"
              fullWidth
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Asset Code"
              size="small"
              fullWidth
              placeholder="e.g. LPT-001"
              value={form.assetCode}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  assetCode: e.target.value.toUpperCase(),
                }))
              }
            />
          </Grid>
          <Grid item xs={6}>
            <Autocomplete
              freeSolo
              options={categoryOptions}
              value={form.category}
              onChange={(_, newValue) =>
                setForm((f) => ({ ...f, category: newValue ?? "" }))
              }
              onInputChange={(_, newInputValue) =>
                setForm((f) => ({ ...f, category: newInputValue }))
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Category"
                  size="small"
                  fullWidth
                  helperText="Pick an existing category or type a new one"
                />
              )}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Purchase Cost (₹)"
              size="small"
              type="number"
              fullWidth
              value={form.purchaseValue}
              onChange={(e) =>
                setForm((f) => ({ ...f, purchaseValue: e.target.value }))
              }
            />
          </Grid>
          <Grid item xs={6}>
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                Purchase Date
              </Typography>
              <Calendar
                value={
                  form.purchaseDate
                    ? new Date(form.purchaseDate + "T00:00:00")
                    : null
                }
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    purchaseDate: e.value
                      ? dayjs(e.value as Date).format("YYYY-MM-DD")
                      : "",
                  }))
                }
                dateFormat="dd/mm/yy"
                maxDate={new Date()}
                showIcon
                showButtonBar
                appendTo={document.body}
                placeholder="Select date"
                style={{ width: "100%" }}
              />
            </Box>
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Description"
              size="small"
              multiline
              rows={2}
              fullWidth
              value={form.notes}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button variant="ghost" onClick={onClose} size="small">
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          variant="primary"
          size="small"
          disabled={submitting || !form.name || !form.assetCode}
        >
          {submitting ? "Creating…" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
