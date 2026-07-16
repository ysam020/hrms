import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@web/shared/components/Button";
import Dialog from "@mui/material/Dialog";
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import RadioGroup from "@mui/material/RadioGroup";
import Radio from "@mui/material/Radio";
import FormControlLabel from "@mui/material/FormControlLabel";
import SaveIcon from "@mui/icons-material/Save";
import { resolveEffectiveDate, type EffectiveDatePreset } from "./helpers";

export function SaveDialog({
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
