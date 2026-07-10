import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";

/**
 * Shared small-number-input builder used across Settings pages (Organisation
 * Settings, Shifts, ...) so every numeric policy field looks and
 * behaves the same way.
 */
export function numField(
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
