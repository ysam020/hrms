import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import WorkWeekPicker from "@web/shared/components/WorkWeekPicker";
import type { SectionProps } from "./types";

export function WorkWeekSection({
  settings,
  onChange,
  readOnly,
}: SectionProps) {
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
