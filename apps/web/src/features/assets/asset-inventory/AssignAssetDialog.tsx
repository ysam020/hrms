import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Autocomplete from "@mui/material/Autocomplete";
import CircularProgress from "@mui/material/CircularProgress";
import { CONDITION_OPTIONS } from "./constants";

export interface AssignForm {
  userId: string;
  conditionOut: string;
  notes: string;
}

export type EmpOption = { value: string; label: string };

export function AssignAssetDialog({
  open,
  assetCode,
  onClose,
  form,
  setForm,
  empOptions,
  empInputValue,
  setEmpInputValue,
  empSearching,
  submitting,
  onSubmit,
}: {
  open: boolean;
  assetCode: string | undefined;
  onClose: () => void;
  form: AssignForm;
  setForm: (update: (f: AssignForm) => AssignForm) => void;
  empOptions: EmpOption[];
  empInputValue: string;
  setEmpInputValue: (v: string) => void;
  empSearching: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Assign Asset {assetCode}</DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          pt: "16px !important",
        }}
      >
        <Autocomplete
          options={empOptions}
          getOptionLabel={(o) => o.label}
          inputValue={empInputValue}
          onInputChange={(_, v) => setEmpInputValue(v)}
          onChange={(_, selected) =>
            setForm((f) => ({ ...f, userId: selected?.value ?? "" }))
          }
          loading={empSearching}
          filterOptions={(x) => x} // server already filters
          isOptionEqualToValue={(o, v) => o.value === v.value}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Employee"
              size="small"
              placeholder="Search by username…"
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {empSearching ? <CircularProgress size={16} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                ),
              }}
            />
          )}
        />
        <TextField
          select
          label="Condition Out"
          size="small"
          fullWidth
          value={form.conditionOut}
          onChange={(e) =>
            setForm((f) => ({ ...f, conditionOut: e.target.value }))
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
          disabled={submitting || !form.userId}
        >
          {submitting ? "Assigning…" : "Assign"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
