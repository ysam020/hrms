import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid2";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import Divider from "@mui/material/Divider";
import { numField } from "@web/shared/components/numField";
import type { SectionProps } from "./types";

export function AttendanceSection({
  settings,
  onChange,
  readOnly,
}: SectionProps) {
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
