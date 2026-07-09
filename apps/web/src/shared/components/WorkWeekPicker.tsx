import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";

export type WorkWeekType = "mon_fri" | "mon_sat" | "custom";

export interface WorkWeekValue {
  type: WorkWeekType;
  /** 0=Sun .. 6=Sat */
  workingDays: number[];
}

const MON_FRI = [1, 2, 3, 4, 5];
const MON_SAT = [1, 2, 3, 4, 5, 6];

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function defaultWorkWeek(type: WorkWeekType = "mon_fri"): WorkWeekValue {
  if (type === "mon_sat") return { type, workingDays: MON_SAT };
  if (type === "custom") return { type, workingDays: MON_FRI };
  return { type: "mon_fri", workingDays: MON_FRI };
}

/**
 * Asked once at signup and editable later in Organisation Settings — getting
 * this wrong silently corrupts attendance/leave day-count math from day one,
 * so unlike most onboarding fields it isn't just auto-defaulted.
 */
export default function WorkWeekPicker({
  value,
  onChange,
  disabled,
}: {
  value: WorkWeekValue;
  onChange: (v: WorkWeekValue) => void;
  disabled?: boolean;
}) {
  function handleTypeChange(type: WorkWeekType) {
    if (type === "mon_fri") onChange({ type, workingDays: MON_FRI });
    else if (type === "mon_sat") onChange({ type, workingDays: MON_SAT });
    else onChange({ type: "custom", workingDays: value.workingDays });
  }

  function toggleDay(day: number) {
    const has = value.workingDays.includes(day);
    const workingDays = has
      ? value.workingDays.filter((d) => d !== day)
      : [...value.workingDays, day].sort();
    onChange({ type: "custom", workingDays });
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <FormControl fullWidth size="small">
        <InputLabel id="work-week-label">Work week</InputLabel>
        <Select
          labelId="work-week-label"
          label="Work week"
          value={value.type}
          disabled={disabled}
          onChange={(e) => handleTypeChange(e.target.value as WorkWeekType)}
        >
          <MenuItem value="mon_fri">Monday – Friday</MenuItem>
          <MenuItem value="mon_sat">Monday – Saturday</MenuItem>
          <MenuItem value="custom">Custom…</MenuItem>
        </Select>
      </FormControl>

      {value.type === "custom" && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.5 }}
          >
            Select working days
          </Typography>
          <ToggleButtonGroup size="small" disabled={disabled}>
            {DAY_LABELS.map((label, day) => (
              <ToggleButton
                key={day}
                value={day}
                selected={value.workingDays.includes(day)}
                onClick={() => toggleDay(day)}
                title={DAY_FULL[day]}
                sx={{ minWidth: 40 }}
              >
                {label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      )}
    </Box>
  );
}
