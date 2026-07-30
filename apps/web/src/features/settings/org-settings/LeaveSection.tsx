import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid2";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@web/shared/components/Button";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitleWithClose from "@web/shared/components/DialogTitleWithClose";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import FormControl from "@mui/material/FormControl";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import TuneIcon from "@mui/icons-material/Tune";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import { ignoreBackdropClick } from "@web/shared/utils/dialogClose";
import SaveIcon from "@mui/icons-material/Save";
import { numField } from "@web/shared/components/numField";
import {
  EMPTY_LEAVE_POLICY,
  type CustomLeaveType,
  type LeavePolicy,
  type SectionProps,
} from "./types";

export function LeaveSection({ settings, onChange, readOnly }: SectionProps) {
  const [newType, setNewType] = useState<CustomLeaveType>({
    name: "",
    key: "",
    daysPerYear: 10,
    requiresProof: false,
  });

  function addCustomType() {
    if (!newType.name.trim() || !newType.key.trim()) return;
    onChange({
      customLeaveTypes: [
        ...settings.customLeaveTypes,
        { ...newType, key: newType.key.trim().toUpperCase() },
      ],
    });
    setNewType({ name: "", key: "", daysPerYear: 10, requiresProof: false });
  }

  function removeCustomType(idx: number) {
    onChange({
      customLeaveTypes: settings.customLeaveTypes.filter((_, i) => i !== idx),
    });
  }

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Built-in Leave Quotas
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Annual entitlement for the three standard leave types. These caps are
          checked when employees apply for leave.
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Paid Leaves / year",
            settings.paidLeavesPerYear,
            (v) => onChange({ paidLeavesPerYear: v }),
            { min: 0, suffix: "days", disabled: readOnly },
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Sick Leaves / year",
            settings.sickLeavesPerYear,
            (v) => onChange({ sickLeavesPerYear: v }),
            { min: 0, suffix: "days", disabled: readOnly },
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Casual Leaves / year",
            settings.casualLeavesPerYear,
            (v) => onChange({ casualLeavesPerYear: v }),
            { min: 0, suffix: "days", disabled: readOnly },
          )}
        </Grid>
      </Grid>

      <Divider sx={{ mb: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Sick Leave Policy
      </Typography>
      <FormControlLabel
        disabled={readOnly}
        control={
          <Switch
            checked={settings.medicalCertRequired}
            onChange={(e) =>
              onChange({ medicalCertRequired: e.target.checked })
            }
          />
        }
        label={
          <Box sx={{ ml: 0.5 }}>
            <Typography variant="body2">
              Require a medical certificate for sick leave
            </Typography>
            <Typography variant="caption" color="text.secondary">
              When enabled, employees must upload a certificate when marking a
              leave as sick.
            </Typography>
          </Box>
        }
        sx={{ alignItems: "flex-start", mt: 1 }}
      />

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Custom Leave Types
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Add organisation-specific types (e.g. Maternity, Paternity, Comp-off).
          Employees can pick these when applying for leave.
        </Typography>
      </Box>

      {settings.customLeaveTypes.length > 0 && (
        <Box sx={{ mb: 2.5, display: "flex", flexWrap: "wrap", gap: 1 }}>
          {settings.customLeaveTypes.map((lt, i) => (
            <Chip
              key={i}
              label={`${lt.name} (${lt.key}) · ${lt.daysPerYear}d${lt.requiresProof ? " · proof req." : ""}`}
              onDelete={readOnly ? undefined : () => removeCustomType(i)}
              variant="outlined"
              size="small"
            />
          ))}
        </Box>
      )}

      {!readOnly && (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 2 }}
          >
            New leave type
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField
                label="Name"
                size="small"
                fullWidth
                placeholder="Maternity Leave"
                slotProps={{ inputLabel: { shrink: true } }}
                value={newType.name}
                onChange={(e) =>
                  setNewType((p) => ({ ...p, name: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <TextField
                label="Key"
                size="small"
                fullWidth
                placeholder="ML"
                slotProps={{ inputLabel: { shrink: true } }}
                inputProps={{ style: { textTransform: "uppercase" } }}
                value={newType.key}
                onChange={(e) =>
                  setNewType((p) => ({
                    ...p,
                    key: e.target.value.toUpperCase(),
                  }))
                }
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              {numField(
                "Days / year",
                newType.daysPerYear,
                (v) => setNewType((p) => ({ ...p, daysPerYear: v })),
                { min: 1 },
              )}
            </Grid>
            <Grid size={{ xs: 8, sm: 3 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={newType.requiresProof}
                    onChange={(e) =>
                      setNewType((p) => ({
                        ...p,
                        requiresProof: e.target.checked,
                      }))
                    }
                  />
                }
                label={<Typography variant="body2">Requires proof</Typography>}
              />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <Button
                variant="outline"
                size="small"
                icon={<AddCircleOutlineIcon />}
                onClick={addCustomType}
                disabled={!newType.name.trim() || !newType.key.trim()}
                fullWidth
              >
                Add
              </Button>
            </Grid>
          </Grid>
        </Paper>
      )}

      <Divider sx={{ my: 3 }} />

      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
        <TuneIcon fontSize="small" color="primary" />
        <Typography variant="subtitle1" fontWeight={600}>
          Advanced Policy
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Optional, per leave type — carry-forward, encashment, comp-off, and what
        happens when someone applies for more than they have left. Leave types
        you don't configure here keep behaving exactly as the simple quotas
        above describe.
      </Typography>

      <LeavePolicyEditor
        policies={settings.leavePolicies}
        onChange={(leavePolicies) => onChange({ leavePolicies })}
        readOnly={readOnly}
      />
    </Box>
  );
}

function LeavePolicyEditor({
  policies,
  onChange,
  readOnly,
}: {
  policies: LeavePolicy[];
  onChange: (policies: LeavePolicy[]) => void;
  readOnly: boolean;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<LeavePolicy>(EMPTY_LEAVE_POLICY);

  function openAdd() {
    setEditingIndex(null);
    setDraft(EMPTY_LEAVE_POLICY);
    setDialogOpen(true);
  }
  function openEdit(idx: number) {
    setEditingIndex(idx);
    setDraft(policies[idx]);
    setDialogOpen(true);
  }
  function remove(idx: number) {
    onChange(policies.filter((_, i) => i !== idx));
  }
  function save() {
    const next = [...policies];
    const withKey = { ...draft, key: draft.key.trim().toUpperCase() };
    if (editingIndex === null) next.push(withKey);
    else next[editingIndex] = withKey;
    onChange(next);
    setDialogOpen(false);
  }

  return (
    <Box>
      {policies.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          No advanced policy configured yet.
        </Typography>
      ) : (
        policies.map((p, i) => (
          <Accordion key={p.key || i} variant="outlined" sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  flexWrap: "wrap",
                }}
              >
                <Typography variant="body2" fontWeight={600}>
                  {p.name} ({p.key})
                </Typography>
                {p.isStatutory && (
                  <Chip
                    size="small"
                    label="Statutory"
                    color="primary"
                    variant="outlined"
                  />
                )}
                {p.isCompOff && (
                  <Chip size="small" label="Comp-off" variant="outlined" />
                )}
                {p.carryForward.enabled && (
                  <Chip size="small" label="Carry-forward" variant="outlined" />
                )}
                {p.encashment.enabled && (
                  <Chip size="small" label="Encashable" variant="outlined" />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 0.5,
                  mb: 1.5,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  {p.daysPerYear} days/year ·{" "}
                  {p.accrualMethod === "monthly"
                    ? "Accrued monthly"
                    : "Granted upfront"}
                  {p.prorateByJoinDate ? ", prorated for new joiners" : ""}
                </Typography>
                {p.carryForward.enabled && (
                  <Typography variant="caption" color="text.secondary">
                    Carry-forward: up to {p.carryForward.maxDays ?? "unlimited"}{" "}
                    days
                    {p.carryForward.expiryMonths
                      ? `, expiring after ${p.carryForward.expiryMonths} months`
                      : ""}
                  </Typography>
                )}
                {p.encashment.enabled && (
                  <Typography variant="caption" color="text.secondary">
                    Encashment: ₹{p.encashment.ratePerDay ?? 0}/day, up to{" "}
                    {p.encashment.maxDaysPerYear ?? "unlimited"} days/year
                  </Typography>
                )}
                {p.isCompOff && (
                  <Typography variant="caption" color="text.secondary">
                    Expires {p.compOffExpiryDays ?? 90} days after being earned
                  </Typography>
                )}
                <Typography variant="caption" color="text.secondary">
                  When exhausted:{" "}
                  {p.onExhaustion === "reject"
                    ? "block the application"
                    : p.onExhaustion === "auto_lop"
                      ? "allow as loss-of-pay"
                      : "allow, approver decides"}
                </Typography>
              </Box>
              {!readOnly && (
                <Box sx={{ display: "flex", gap: 1 }}>
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => openEdit(i)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove">
                    <IconButton size="small" onClick={() => remove(i)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        ))
      )}

      {!readOnly && (
        <Button
          variant="outline"
          size="small"
          icon={<AddCircleOutlineIcon />}
          onClick={openAdd}
          style={{ marginTop: 8 }}
        >
          Add advanced policy
        </Button>
      )}

      <Dialog
        open={dialogOpen}
        onClose={ignoreBackdropClick(() => setDialogOpen(false))}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitleWithClose onClose={() => setDialogOpen(false)}>
          {editingIndex === null ? "Add leave policy" : "Edit leave policy"}
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
                placeholder="Maternity Leave"
                slotProps={{ inputLabel: { shrink: true } }}
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, name: e.target.value }))
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField
                label="Key"
                size="small"
                fullWidth
                placeholder="ML"
                slotProps={{ inputLabel: { shrink: true } }}
                inputProps={{ style: { textTransform: "uppercase" } }}
                value={draft.key}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, key: e.target.value.toUpperCase() }))
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              {numField(
                "Days / year",
                draft.daysPerYear,
                (v) => setDraft((d) => ({ ...d, daysPerYear: v })),
                { min: 0 },
              )}
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Accrual</InputLabel>
                <Select
                  label="Accrual"
                  value={draft.accrualMethod}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      accrualMethod: e.target
                        .value as LeavePolicy["accrualMethod"],
                    }))
                  }
                >
                  <MenuItem value="lump_sum">Granted upfront</MenuItem>
                  <MenuItem value="monthly">Accrued monthly</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={draft.isStatutory}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, isStatutory: e.target.checked }))
                  }
                />
              }
              label={
                <Typography variant="body2">
                  Statutory (skip carry-forward/proration rules)
                </Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={draft.requiresProof}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, requiresProof: e.target.checked }))
                  }
                />
              }
              label={<Typography variant="body2">Requires proof</Typography>}
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={draft.prorateByJoinDate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      prorateByJoinDate: e.target.checked,
                    }))
                  }
                />
              }
              label={
                <Typography variant="body2">Prorate for new joiners</Typography>
              }
            />
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={draft.isCompOff}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, isCompOff: e.target.checked }))
                  }
                />
              }
              label={
                <Typography variant="body2">This is a comp-off type</Typography>
              }
            />
          </Box>

          {draft.isCompOff && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                {numField(
                  "Comp-off expires after",
                  draft.compOffExpiryDays ?? 90,
                  (v) => setDraft((d) => ({ ...d, compOffExpiryDays: v })),
                  { min: 1, suffix: "days" },
                )}
              </Grid>
            </Grid>
          )}

          <Divider />

          <FormControlLabel
            control={
              <Switch
                checked={draft.carryForward.enabled}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    carryForward: {
                      ...d.carryForward,
                      enabled: e.target.checked,
                    },
                  }))
                }
              />
            }
            label={
              <Typography variant="body2" fontWeight={500}>
                Carry-forward to next year
              </Typography>
            }
          />
          {draft.carryForward.enabled && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                {numField(
                  "Max days",
                  draft.carryForward.maxDays ?? 0,
                  (v) =>
                    setDraft((d) => ({
                      ...d,
                      carryForward: { ...d.carryForward, maxDays: v },
                    })),
                  { min: 0 },
                )}
              </Grid>
              <Grid size={{ xs: 6 }}>
                {numField(
                  "Expires after",
                  draft.carryForward.expiryMonths ?? 0,
                  (v) =>
                    setDraft((d) => ({
                      ...d,
                      carryForward: { ...d.carryForward, expiryMonths: v },
                    })),
                  { min: 0, suffix: "months", helperText: "0 = never expires" },
                )}
              </Grid>
            </Grid>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={draft.encashment.enabled}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    encashment: { ...d.encashment, enabled: e.target.checked },
                  }))
                }
              />
            }
            label={
              <Typography variant="body2" fontWeight={500}>
                Allow encashment
              </Typography>
            }
          />
          {draft.encashment.enabled && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                {numField(
                  "Rate per day",
                  draft.encashment.ratePerDay ?? 0,
                  (v) =>
                    setDraft((d) => ({
                      ...d,
                      encashment: { ...d.encashment, ratePerDay: v },
                    })),
                  { min: 0, suffix: "₹" },
                )}
              </Grid>
              <Grid size={{ xs: 6 }}>
                {numField(
                  "Max days / year",
                  draft.encashment.maxDaysPerYear ?? 0,
                  (v) =>
                    setDraft((d) => ({
                      ...d,
                      encashment: { ...d.encashment, maxDaysPerYear: v },
                    })),
                  { min: 0 },
                )}
              </Grid>
            </Grid>
          )}

          <Divider />

          <FormControl fullWidth size="small">
            <InputLabel>When balance is exhausted</InputLabel>
            <Select
              label="When balance is exhausted"
              value={draft.onExhaustion}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  onExhaustion: e.target.value as LeavePolicy["onExhaustion"],
                }))
              }
            >
              <MenuItem value="reject">Block the application</MenuItem>
              <MenuItem value="auto_lop">
                Allow automatically, as loss-of-pay
              </MenuItem>
              <MenuItem value="manager_override">
                Allow — approver decides
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setDialogOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="small"
            onClick={save}
            disabled={
              !draft.name.trim() || !draft.key.trim() || !draft.daysPerYear
            }
            icon={<SaveIcon />}
          >
            {editingIndex === null ? "Add" : "Update"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
