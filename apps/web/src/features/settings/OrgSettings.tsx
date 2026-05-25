import {
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
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
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import FenceIcon from "@mui/icons-material/Fence";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import SaveIcon from "@mui/icons-material/Save";
import ScheduleIcon from "@mui/icons-material/Schedule";
import CancelIcon from "@mui/icons-material/Cancel";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import type { LocationValue } from "@web/shared/components/LocationPicker";

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

interface SettingsSnapshot {
  id: string | null;
  effectiveFrom: string | null;
  note: string | null;
  paidLeavesPerYear: number;
  sickLeavesPerYear: number;
  casualLeavesPerYear: number;
  medicalCertRequired: boolean;
  customLeaveTypes: CustomLeaveType[];
  workStartHour: number;
  workStartMinute: number;
  lateGracePeriodMinutes: number;
  fullDayMinHours: number;
  halfDayMinHours: number;
  probationPeriodDays: number;
  noticePeriodDays: number;
  // Geofencing
  geofencingEnabled: boolean;
  officeLatitude: number | null;
  officeLongitude: number | null;
  officeName: string | null;
  geofenceRadiusMeters: number;
}

const SCHEMA_DEFAULTS: SettingsSnapshot = {
  id: null,
  effectiveFrom: null,
  note: null,
  paidLeavesPerYear: 12,
  sickLeavesPerYear: 12,
  casualLeavesPerYear: 6,
  medicalCertRequired: false,
  customLeaveTypes: [],
  workStartHour: 9,
  workStartMinute: 0,
  lateGracePeriodMinutes: 30,
  fullDayMinHours: 8,
  halfDayMinHours: 4,
  probationPeriodDays: 90,
  noticePeriodDays: 30,
  // Geofencing
  geofencingEnabled: false,
  officeLatitude: null,
  officeLongitude: null,
  officeName: null,
  geofenceRadiusMeters: 200,
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

// ─── numField helper ─────────────────────────────────────────────────────────

function numField(
  label: string,
  value: number,
  onChange: (v: number) => void,
  opts: {
    min?: number;
    max?: number;
    suffix?: string;
    helperText?: string;
    disabled?: boolean;
  } = {},
) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      fullWidth
      disabled={opts.disabled}
      helperText={opts.helperText}
      slotProps={{
        inputLabel: { shrink: true },
        htmlInput: { min: opts.min ?? 0, max: opts.max },
        input: opts.suffix
          ? {
              endAdornment: (
                <InputAdornment position="end">{opts.suffix}</InputAdornment>
              ),
            }
          : undefined,
      }}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
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
                variant="outlined"
                size="small"
                startIcon={<AddCircleOutlineIcon />}
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
      </Grid>
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
    >
      <DialogTitle sx={{ fontWeight: 600 }}>
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
        <Button onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={saving || (preset === "custom" && !custom)}
          startIcon={
            saving ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <SaveIcon />
            )
          }
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function OrgSettings() {
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [active, setActive] = useState<SettingsSnapshot>(SCHEMA_DEFAULTS);
  const [pending, setPending] = useState<SettingsSnapshot[]>([]);
  const [draft, setDraft] = useState<SettingsSnapshot>(SCHEMA_DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const canEdit =
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    user?.permissions?.some((p: string) => p.startsWith("OrgSettings:"));

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

  const TABS = [
    { label: "Leave", icon: <EventAvailableIcon fontSize="small" /> },
    { label: "Attendance", icon: <AccessTimeIcon fontSize="small" /> },
    { label: "HR Policy", icon: <BusinessCenterIcon fontSize="small" /> },
  ];

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
            variant="contained"
            startIcon={<SaveIcon />}
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
                    size="small"
                    color="inherit"
                    startIcon={
                      cancelling === p.id ? (
                        <CircularProgress size={12} color="inherit" />
                      ) : (
                        <CancelIcon fontSize="small" />
                      )
                    }
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
          onChange={(_, v) => setTab(v)}
          sx={{ px: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {TABS.map((t, i) => (
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
