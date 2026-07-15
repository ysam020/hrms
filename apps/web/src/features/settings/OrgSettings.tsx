import {
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid2";
import TextField from "@mui/material/TextField";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Button from "@web/shared/components/Button";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
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
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import FenceIcon from "@mui/icons-material/Fence";
import HomeWorkIcon from "@mui/icons-material/HomeWork";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import SaveIcon from "@mui/icons-material/Save";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CancelIcon from "@mui/icons-material/Cancel";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";
import { API_ENDPOINTS } from "@web/shared/constants";
import type { LocationValue } from "@web/shared/components/LocationPicker";
import { numField } from "@web/shared/components/numField";
import WorkWeekPicker, {
  defaultWorkWeek,
  type WorkWeekValue,
} from "@web/shared/components/WorkWeekPicker";
import CalendarViewWeekIcon from "@mui/icons-material/CalendarViewWeek";
import LogoutIcon from "@mui/icons-material/Logout";
import PaymentsIcon from "@mui/icons-material/Payments";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ExitPolicySettings from "@web/features/settings/exit-policy/ExitPolicySettings";
import PayrollComponentsSettings from "@web/features/settings/payroll-components/PayrollComponentsSettings";
import RecruitmentPipelineSettings from "@web/features/settings/recruitment-pipeline/RecruitmentPipelineSettings";

const LocationPicker = lazy(
  () => import("@web/shared/components/LocationPicker"),
);

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomLeaveType {
  name: string;
  key: string;
  daysPerYear: number;
  requiresProof: boolean;
}

interface LeavePolicy {
  key: string;
  name: string;
  daysPerYear: number;
  isStatutory: boolean;
  requiresProof: boolean;
  accrualMethod: "lump_sum" | "monthly";
  prorateByJoinDate: boolean;
  carryForward: {
    enabled: boolean;
    maxDays: number | null;
    expiryMonths: number | null;
  };
  encashment: {
    enabled: boolean;
    ratePerDay: number | null;
    maxDaysPerYear: number | null;
  };
  isCompOff: boolean;
  compOffExpiryDays: number | null;
  onExhaustion: "reject" | "auto_lop" | "manager_override";
}

const EMPTY_LEAVE_POLICY: LeavePolicy = {
  key: "",
  name: "",
  daysPerYear: 0,
  isStatutory: false,
  requiresProof: false,
  accrualMethod: "lump_sum",
  prorateByJoinDate: true,
  carryForward: { enabled: false, maxDays: null, expiryMonths: null },
  encashment: { enabled: false, ratePerDay: null, maxDaysPerYear: null },
  isCompOff: false,
  compOffExpiryDays: 90,
  onExhaustion: "manager_override",
};

interface SettingsSnapshot {
  id: string | null;
  effectiveFrom: string | null;
  note: string | null;
  workWeekPattern: WorkWeekValue;
  paidLeavesPerYear: number;
  sickLeavesPerYear: number;
  casualLeavesPerYear: number;
  medicalCertRequired: boolean;
  customLeaveTypes: CustomLeaveType[];
  leavePolicies: LeavePolicy[];
  workStartHour: number;
  workStartMinute: number;
  lateGracePeriodMinutes: number;
  fullDayMinHours: number;
  halfDayMinHours: number;
  regularizationBackdateWindowDays: number;
  overtimePreApprovalRequired: boolean;
  probationPeriodDays: number;
  noticePeriodDays: number;
  maxInterviewRounds: number;
  // Geofencing
  geofencingEnabled: boolean;
  officeLatitude: number | null;
  officeLongitude: number | null;
  officeName: string | null;
  geofenceRadiusMeters: number;
  // Modules
  wfhEnabled: boolean;
}

const SCHEMA_DEFAULTS: SettingsSnapshot = {
  id: null,
  effectiveFrom: null,
  note: null,
  workWeekPattern: defaultWorkWeek(),
  paidLeavesPerYear: 12,
  sickLeavesPerYear: 12,
  casualLeavesPerYear: 6,
  medicalCertRequired: false,
  customLeaveTypes: [],
  leavePolicies: [],
  workStartHour: 9,
  workStartMinute: 0,
  lateGracePeriodMinutes: 30,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
  regularizationBackdateWindowDays: 3,
  overtimePreApprovalRequired: false,
  probationPeriodDays: 90,
  noticePeriodDays: 30,
  maxInterviewRounds: 5,
  // Geofencing
  geofencingEnabled: false,
  officeLatitude: null,
  officeLongitude: null,
  officeName: null,
  geofenceRadiusMeters: 200,
  // Modules
  wfhEnabled: true,
};

// ─── Effective-date helpers ───────────────────────────────────────────────────

type EffectiveDatePreset = "now" | "next_month" | "next_year" | "custom";

function resolveEffectiveDate(
  preset: EffectiveDatePreset,
  custom: string,
): Date {
  const now = new Date();
  if (preset === "next_month") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  if (preset === "next_year") {
    return new Date(now.getFullYear() + 1, 0, 1);
  }
  if (preset === "custom" && custom) {
    return new Date(custom);
  }
  return now;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Tab Panel ────────────────────────────────────────────────────────────────

function TabPanel({
  children,
  value,
  index,
}: {
  children: ReactNode;
  value: number;
  index: number;
}) {
  return value === index ? <Box sx={{ pt: 3 }}>{children}</Box> : null;
}

// ─── Sub-tabs ─────────────────────────────────────────────────────────────────
// slug drives deep-linking (?subtab=...) — see OnboardingModals.tsx, which
// links straight into a specific sub-tab (e.g. "Configure exit policy").

const SUB_TABS = [
  {
    label: "Leave",
    slug: "leave",
    icon: <EventAvailableIcon fontSize="small" />,
  },
  {
    label: "Attendance",
    slug: "attendance",
    icon: <AccessTimeIcon fontSize="small" />,
  },
  {
    label: "HR Policy",
    slug: "hr-policy",
    icon: <BusinessCenterIcon fontSize="small" />,
  },
  {
    label: "Work Week",
    slug: "work-week",
    icon: <CalendarViewWeekIcon fontSize="small" />,
  },
  {
    label: "Exit Policy",
    slug: "exit-policy",
    icon: <LogoutIcon fontSize="small" />,
  },
  {
    label: "Payroll Components",
    slug: "payroll-components",
    icon: <PaymentsIcon fontSize="small" />,
  },
  {
    label: "Recruitment Pipeline",
    slug: "recruitment-pipeline",
    icon: <AccountTreeIcon fontSize="small" />,
  },
];

const SUB_TAB_LS_KEY = "org_settings_subtab";

function subTabSlugToIndex(slug: string | null): number {
  if (!slug) return 0;
  const idx = SUB_TABS.findIndex((t) => t.slug === slug);
  return idx === -1 ? 0 : idx;
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function LeaveSection({
  settings,
  onChange,
  readOnly,
}: {
  settings: SettingsSnapshot;
  onChange: (patch: Partial<SettingsSnapshot>) => void;
  readOnly: boolean;
}) {
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
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        TransitionComponent={SlideUpTransition}
      >
        <DialogTitle>
          {editingIndex === null ? "Add leave policy" : "Edit leave policy"}
        </DialogTitle>
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

function AttendanceSection({
  settings,
  onChange,
  readOnly,
}: {
  settings: SettingsSnapshot;
  onChange: (patch: Partial<SettingsSnapshot>) => void;
  readOnly: boolean;
}) {
  const lateMinutes =
    settings.workStartHour * 60 +
    settings.workStartMinute +
    settings.lateGracePeriodMinutes;
  const lateH = Math.floor(lateMinutes / 60);
  const lateM = lateMinutes % 60;
  const lateStr = `${String(lateH).padStart(2, "0")}:${String(lateM).padStart(2, "0")}`;

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Work Start Time &amp; Late Threshold
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Employees who check in after{" "}
          <strong>
            {String(settings.workStartHour).padStart(2, "0")}:
            {String(settings.workStartMinute).padStart(2, "0")}
          </strong>{" "}
          + {settings.lateGracePeriodMinutes} min grace period (i.e. after{" "}
          <strong>{lateStr}</strong>) are marked <em>Late</em>.
        </Typography>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          {numField(
            "Start — hour",
            settings.workStartHour,
            (v) => onChange({ workStartHour: Math.min(23, Math.max(0, v)) }),
            { min: 0, max: 23, suffix: "h", disabled: readOnly },
          )}
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          {numField(
            "Start — minute",
            settings.workStartMinute,
            (v) => onChange({ workStartMinute: Math.min(59, Math.max(0, v)) }),
            { min: 0, max: 59, suffix: "m", disabled: readOnly },
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Late grace period",
            settings.lateGracePeriodMinutes,
            (v) => onChange({ lateGracePeriodMinutes: Math.max(0, v) }),
            {
              min: 0,
              suffix: "min",
              helperText: "Minutes after work start before marking as Late",
              disabled: readOnly,
            },
          )}
        </Grid>
      </Grid>

      <Divider sx={{ mb: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Day Classification
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          Minimum working hours required to count as a full or half day.
          Anything below the half-day threshold → <em>Half Day</em>.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Full day — min hours",
            settings.fullDayMinHours,
            (v) => onChange({ fullDayMinHours: Math.max(0.5, v) }),
            { min: 0.5, suffix: "hrs", disabled: readOnly },
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Half day — min hours",
            settings.halfDayMinHours,
            (v) => onChange({ halfDayMinHours: Math.max(0.5, v) }),
            {
              min: 0.5,
              suffix: "hrs",
              helperText: "Below this → Half Day",
              disabled: readOnly,
            },
          )}
        </Grid>
      </Grid>

      <Divider sx={{ my: 3 }} />

      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Corrections &amp; Overtime
      </Typography>

      <Grid container spacing={3} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Regularization window",
            settings.regularizationBackdateWindowDays,
            (v) =>
              onChange({ regularizationBackdateWindowDays: Math.max(0, v) }),
            {
              min: 0,
              suffix: "days",
              helperText: "How far back employees can request a correction",
              disabled: readOnly,
            },
          )}
        </Grid>
      </Grid>

      <FormControlLabel
        disabled={readOnly}
        control={
          <Switch
            checked={settings.overtimePreApprovalRequired}
            onChange={(e) =>
              onChange({ overtimePreApprovalRequired: e.target.checked })
            }
          />
        }
        label={
          <Box sx={{ ml: 0.5 }}>
            <Typography variant="body2">
              Require overtime pre-approval
            </Typography>
            <Typography variant="caption" color="text.secondary">
              When enabled, an overtime request must be approved before it
              counts — otherwise requests are logged and auto-approved.
            </Typography>
          </Box>
        }
        sx={{ alignItems: "flex-start" }}
      />
    </Box>
  );
}

// ─── Geofencing Section ───────────────────────────────────────────────────────

function GeofencingSection({
  settings,
  onChange,
  readOnly,
}: {
  settings: SettingsSnapshot;
  onChange: (patch: Partial<SettingsSnapshot>) => void;
  readOnly: boolean;
}) {
  return (
    <Box>
      <Divider sx={{ my: 3 }} />

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 1,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <HomeWorkIcon fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>
              Work From Home
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Allow employees to submit WFH requests. When disabled, the WFH
            module is hidden across the app for everyone in this organisation.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={settings.wfhEnabled}
              onChange={(e) =>
                !readOnly && onChange({ wfhEnabled: e.target.checked })
              }
              disabled={readOnly}
              color="primary"
            />
          }
          label={
            <Typography variant="body2" fontWeight={500}>
              {settings.wfhEnabled ? "Enabled" : "Disabled"}
            </Typography>
          }
          labelPlacement="start"
        />
      </Box>

      <Divider sx={{ my: 3 }} />

      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 1,
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <FenceIcon fontSize="small" color="primary" />
            <Typography variant="subtitle1" fontWeight={600}>
              Geofencing
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Require employees to punch in from within a set radius of the
            office. Employees marked as <strong>Work From Home</strong> are
            validated against their registered home address instead.
          </Typography>
        </Box>
        <FormControlLabel
          control={
            <Switch
              checked={settings.geofencingEnabled}
              onChange={(e) =>
                !readOnly && onChange({ geofencingEnabled: e.target.checked })
              }
              disabled={readOnly}
              color="primary"
            />
          }
          label={
            <Typography variant="body2" fontWeight={500}>
              {settings.geofencingEnabled ? "Enabled" : "Disabled"}
            </Typography>
          }
          labelPlacement="start"
        />
      </Box>

      {settings.geofencingEnabled && (
        <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Radius */}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 4 }}>
              {numField(
                "Allowed radius",
                settings.geofenceRadiusMeters,
                (v) => onChange({ geofenceRadiusMeters: Math.max(50, v) }),
                {
                  min: 50,
                  suffix: "m",
                  helperText: "Min 50 m — applies to both office and WFH",
                  disabled: readOnly,
                },
              )}
            </Grid>
          </Grid>

          {/* Office location picker */}
          <Box>
            <Typography variant="body2" fontWeight={500} sx={{ mb: 1 }}>
              Office location
            </Typography>
            <Suspense
              fallback={
                <Box
                  sx={{
                    height: 320,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  <CircularProgress size={28} />
                </Box>
              }
            >
              <LocationPicker
                lat={settings.officeLatitude}
                lng={settings.officeLongitude}
                name={settings.officeName}
                disabled={readOnly}
                onChange={(v: LocationValue) =>
                  onChange({
                    officeLatitude: v.lat,
                    officeLongitude: v.lng,
                    officeName: v.name,
                  })
                }
              />
            </Suspense>
          </Box>

          {!readOnly &&
            (settings.officeLatitude == null ||
              settings.officeLongitude == null) && (
              <Alert severity="warning">
                Set the office location above — employees won't be able to check
                in until geofencing is configured with a valid location.
              </Alert>
            )}
        </Box>
      )}
    </Box>
  );
}

function HrSection({
  settings,
  onChange,
  readOnly,
}: {
  settings: SettingsSnapshot;
  onChange: (patch: Partial<SettingsSnapshot>) => void;
  readOnly: boolean;
}) {
  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} gutterBottom>
        Employment Terms
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Defaults used in resignation workflows, offer letters, and reports.
        </Typography>
      </Box>
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Probation period",
            settings.probationPeriodDays,
            (v) => onChange({ probationPeriodDays: Math.max(0, v) }),
            {
              min: 0,
              suffix: "days",
              helperText: "Default probation duration for new hires",
              disabled: readOnly,
            },
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Notice period",
            settings.noticePeriodDays,
            (v) => onChange({ noticePeriodDays: Math.max(0, v) }),
            {
              min: 0,
              suffix: "days",
              helperText: "Default notice period for resignations",
              disabled: readOnly,
            },
          )}
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          {numField(
            "Max interview rounds",
            settings.maxInterviewRounds,
            (v) => onChange({ maxInterviewRounds: Math.max(1, v) }),
            {
              min: 1,
              suffix: "rounds",
              helperText:
                "How many interview rounds this tenant runs per candidate",
              disabled: readOnly,
            },
          )}
        </Grid>
      </Grid>
    </Box>
  );
}

function WorkWeekSection({
  settings,
  onChange,
  readOnly,
}: {
  settings: SettingsSnapshot;
  onChange: (patch: Partial<SettingsSnapshot>) => void;
  readOnly: boolean;
}) {
  return (
    <Box>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mb: 2, maxWidth: 480 }}
      >
        Which days count as working days for your organisation. This drives
        attendance and leave day-count calculations — get it right once and
        every report downstream follows.
      </Typography>
      <Box sx={{ maxWidth: 360 }}>
        <WorkWeekPicker
          value={settings.workWeekPattern}
          onChange={(v) => onChange({ workWeekPattern: v })}
          disabled={readOnly}
        />
      </Box>
    </Box>
  );
}

// ─── Save Dialog ──────────────────────────────────────────────────────────────

function SaveDialog({
  open,
  saving,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  saving: boolean;
  onCancel: () => void;
  onConfirm: (effectiveFrom: Date, note: string) => void;
}) {
  const [preset, setPreset] = useState<EffectiveDatePreset>("now");
  const [custom, setCustom] = useState("");
  const [note, setNote] = useState("");

  const presets: { value: EffectiveDatePreset; label: string; hint: string }[] =
    [
      {
        value: "now",
        label: "Immediately",
        hint: "Takes effect as soon as you save.",
      },
      {
        value: "next_month",
        label: "Start of next month",
        hint: `1 ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString("default", { month: "long", year: "numeric" })}.`,
      },
      {
        value: "next_year",
        label: "Start of next year",
        hint: `1 Jan ${new Date().getFullYear() + 1}.`,
      },
      {
        value: "custom",
        label: "Custom date",
        hint: "Pick any future date.",
      },
    ];

  function handleConfirm() {
    onConfirm(resolveEffectiveDate(preset, custom), note);
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      slots={{ transition: SlideUpTransition }}
      transitionDuration={{ enter: 280, exit: 200 }}
      aria-labelledby="effective-date-dialog-title"
    >
      <DialogTitle id="effective-date-dialog-title" sx={{ fontWeight: 600 }}>
        When should changes take effect?
      </DialogTitle>
      <DialogContent>
        <RadioGroup
          value={preset}
          onChange={(_, v) => setPreset(v as EffectiveDatePreset)}
        >
          {presets.map((p) => (
            <FormControlLabel
              key={p.value}
              value={p.value}
              control={<Radio size="small" />}
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>
                    {p.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {p.hint}
                  </Typography>
                </Box>
              }
              sx={{ alignItems: "flex-start", py: 0.5 }}
            />
          ))}
        </RadioGroup>

        {preset === "custom" && (
          <TextField
            type="date"
            size="small"
            fullWidth
            sx={{ mt: 1.5 }}
            slotProps={{
              inputLabel: { shrink: true },
              htmlInput: {
                min: new Date().toISOString().slice(0, 10),
              },
            }}
            label="Effective date"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
          />
        )}

        <TextField
          label="Change note (optional)"
          placeholder="e.g. Updated leave policy for FY 2026"
          size="small"
          fullWidth
          multiline
          rows={2}
          sx={{ mt: 2.5 }}
          slotProps={{ inputLabel: { shrink: true } }}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button
          variant="ghost"
          size="small"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          size="small"
          onClick={handleConfirm}
          disabled={saving || (preset === "custom" && !custom)}
          icon={<SaveIcon />}
          loading={saving}
          loadingText="Saving…"
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrgSettings() {
  const { setAlert } = useContext(AlertContext);
  const { user, setUser } = useContext(UserContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Derive the initial sub-tab from ?subtab= (deep links, e.g. from
  // onboarding), falling back to whatever was last used, then "Leave".
  const getInitialSubTab = (): number => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("subtab");
    if (slug) return subTabSlugToIndex(slug);
    const saved = localStorage.getItem(SUB_TAB_LS_KEY);
    return subTabSlugToIndex(saved);
  };

  const [tab, setTab] = useState(getInitialSubTab);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [active, setActive] = useState<SettingsSnapshot>(SCHEMA_DEFAULTS);
  const [pending, setPending] = useState<SettingsSnapshot[]>([]);
  const [draft, setDraft] = useState<SettingsSnapshot>(SCHEMA_DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const canEdit =
    isOwnerOrAdmin(user) ||
    user?.permissions?.includes("Organisation:edit_organisation_settings");

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(API_ENDPOINTS.GET_ORG_SETTINGS);
      const data = res.data?.data ?? {};
      const activeSnap: SettingsSnapshot = {
        ...SCHEMA_DEFAULTS,
        ...(data.active ?? {}),
      };
      setActive(activeSnap);
      setDraft(activeSnap);
      setPending(
        (data.pending ?? []).map((p: any) => ({
          ...SCHEMA_DEFAULTS,
          ...p,
        })),
      );
    } catch {
      // Non-critical — silently fall back to defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Sync sub-tab when the URL changes (back/forward navigation, or a new
  // deep link while already on this page).
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const slug = params.get("subtab");
    if (slug) setTab(subTabSlugToIndex(slug));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  function handleSubTabChange(_: unknown, newValue: number) {
    const slug = SUB_TABS[newValue].slug;
    setTab(newValue);
    localStorage.setItem(SUB_TAB_LS_KEY, slug);
    navigate(`/settings?tab=org-settings&subtab=${slug}`, { replace: true });
  }

  // ── Draft handling ───────────────────────────────────────────────────────────

  function handleChange(patch: Partial<SettingsSnapshot>) {
    setDraft((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSaveConfirm(effectiveFrom: Date, note: string) {
    setSaving(true);
    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_ORG_SETTINGS, {
        settings: draft,
        effectiveFrom: effectiveFrom.toISOString(),
        note: note || undefined,
      });
      setAlert({
        open: true,
        message:
          effectiveFrom <= new Date()
            ? "Settings applied immediately."
            : `Settings scheduled for ${formatDate(effectiveFrom.toISOString())}.`,
        severity: "success",
      });
      setDialogOpen(false);
      setDirty(false);
      await fetchSettings();
      // wfhEnabled (and any other profile-bolted tenant settings) are only
      // refreshed on login/page load otherwise — without this, an immediate
      // change (e.g. disabling WFH) wouldn't be reflected in UserContext
      // until the current session's next reload, leaving stale nav/route
      // gating for everyone already logged in, including the person who
      // just made the change.
      if (effectiveFrom <= new Date()) {
        try {
          const profileRes = await apiClient.get(API_ENDPOINTS.GET_PROFILE);
          if (profileRes.data?.success) setUser(profileRes.data.data.user);
        } catch {
          // Non-critical — the setting was still saved successfully.
        }
      }
    } catch (err: any) {
      setAlert({
        open: true,
        message: err?.response?.data?.message ?? "Failed to save settings.",
        severity: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  // ── Cancel pending ───────────────────────────────────────────────────────────

  async function handleCancelPending(id: string) {
    setCancelling(id);
    try {
      await apiClient.delete(API_ENDPOINTS.CANCEL_PENDING_ORG_SETTINGS(id));
      setAlert({
        open: true,
        message: "Pending settings change cancelled.",
        severity: "info",
      });
      await fetchSettings();
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err?.response?.data?.message ?? "Failed to cancel pending change.",
        severity: "error",
      });
    } finally {
      setCancelling(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <Container maxWidth="lg" sx={{ py: 3 }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          mb: 3,
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={700}>
            Organisation Settings
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure leave quotas, attendance rules, and HR policies.
            {active.effectiveFrom && (
              <Typography
                component="span"
                variant="body2"
                color="text.secondary"
              >
                {" "}
                Active since <strong>{formatDate(active.effectiveFrom)}</strong>
                .
              </Typography>
            )}
          </Typography>
        </Box>
        {canEdit && (
          <Button
            variant="primary"
            size="small"
            icon={<SaveIcon />}
            onClick={() => setDialogOpen(true)}
            disabled={!dirty}
          >
            Save changes
          </Button>
        )}
      </Box>

      {/* Read-only notice */}
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You have read-only access. Contact an owner or admin to make changes.
        </Alert>
      )}

      {/* Pending changes banner */}
      {pending.length > 0 && (
        <Box sx={{ mb: 2, display: "flex", flexDirection: "column", gap: 1 }}>
          {pending.map((p) => (
            <Alert
              key={p.id}
              severity="warning"
              icon={<ScheduleIcon fontSize="inherit" />}
              action={
                canEdit ? (
                  <Button
                    variant="danger"
                    size="small"
                    icon={<CancelIcon fontSize="small" />}
                    loading={cancelling === p.id}
                    disabled={cancelling === p.id}
                    onClick={() => handleCancelPending(p.id!)}
                  >
                    Cancel
                  </Button>
                ) : undefined
              }
            >
              <strong>Pending change</strong> scheduled for{" "}
              <strong>{formatDate(p.effectiveFrom)}</strong>
              {p.note ? ` — ${p.note}` : ""}
            </Alert>
          ))}
        </Box>
      )}

      <Paper elevation={0} variant="outlined" sx={{ borderRadius: 2 }}>
        <Tabs
          value={tab}
          onChange={handleSubTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {SUB_TABS.map((t, i) => (
            <Tab
              key={i}
              label={t.label}
              icon={t.icon}
              iconPosition="start"
              sx={{ textTransform: "none", fontWeight: 500, minHeight: 48 }}
            />
          ))}
        </Tabs>

        <Box sx={{ p: 3 }}>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TabPanel value={tab} index={0}>
                <LeaveSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={1}>
                <AttendanceSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
                <GeofencingSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={2}>
                <HrSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={3}>
                <WorkWeekSection
                  settings={draft}
                  onChange={handleChange}
                  readOnly={!canEdit}
                />
              </TabPanel>
              <TabPanel value={tab} index={4}>
                <ExitPolicySettings />
              </TabPanel>
              <TabPanel value={tab} index={5}>
                <PayrollComponentsSettings />
              </TabPanel>
              <TabPanel value={tab} index={6}>
                <RecruitmentPipelineSettings />
              </TabPanel>
            </>
          )}
        </Box>
      </Paper>

      <SaveDialog
        open={dialogOpen}
        saving={saving}
        onCancel={() => setDialogOpen(false)}
        onConfirm={handleSaveConfirm}
      />
    </Container>
  );
}
