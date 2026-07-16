import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";

export function RehireTab({
  rehireEligible,
  onToggle,
}: {
  rehireEligible: boolean | null;
  onToggle: (value: boolean) => void;
}) {
  return (
    <Box>
      <FormControlLabel
        control={
          <Switch
            checked={!!rehireEligible}
            onChange={(e) => onToggle(e.target.checked)}
          />
        }
        label={<Typography variant="body2">Eligible for rehire</Typography>}
      />
    </Box>
  );
}
