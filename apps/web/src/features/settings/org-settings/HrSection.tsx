import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid2";
import { numField } from "@web/shared/components/numField";
import type { SectionProps } from "./types";

export function HrSection({ settings, onChange, readOnly }: SectionProps) {
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
