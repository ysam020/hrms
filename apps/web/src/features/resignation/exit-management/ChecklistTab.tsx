import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Chip from "@mui/material/Chip";
import Alert from "@mui/material/Alert";
import type { ChecklistItem } from "./types";

export function ChecklistTab({
  checklist,
  onToggle,
}: {
  checklist: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
}) {
  return (
    <Box>
      {checklist.length === 0 ? (
        <Alert severity="info">
          No exit checklist configured yet. Add checklist items in Settings →
          Exit Policy to track offboarding steps like assets returned and FnF
          completion here.
        </Alert>
      ) : (
        checklist.map((item) => (
          <FormControlLabel
            key={item.itemDefId}
            sx={{ display: "flex", width: "100%", ml: 0, mb: 0.5 }}
            control={
              <Checkbox
                checked={item.isComplete}
                onChange={() => onToggle(item)}
              />
            }
            label={
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2">{item.label}</Typography>
                <Chip size="small" label={item.owningRole} variant="outlined" />
                {item.isRequired && (
                  <Chip
                    size="small"
                    label="Required"
                    color="warning"
                    variant="outlined"
                  />
                )}
              </Box>
            }
          />
        ))
      )}
    </Box>
  );
}
