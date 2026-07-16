import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Button from "@web/shared/components/Button";
import { states } from "@web/assets/data/statesData";

export function ContactInfoStep({
  helpPhone,
  setHelpPhone,
  helpEmail,
  setHelpEmail,
  officeAddress,
  setOfficeAddress,
  workState,
  setWorkState,
  website,
  setWebsite,
  loading,
  onSkip,
  onSaveAndContinue,
}: {
  helpPhone: string;
  setHelpPhone: (v: string) => void;
  helpEmail: string;
  setHelpEmail: (v: string) => void;
  officeAddress: string;
  setOfficeAddress: (v: string) => void;
  workState: string;
  setWorkState: (v: string) => void;
  website: string;
  setWebsite: (v: string) => void;
  loading: boolean;
  onSkip: () => void;
  onSaveAndContinue: () => void;
}) {
  return (
    <>
      <TextField
        label="Help phone number"
        fullWidth
        value={helpPhone}
        onChange={(e) => setHelpPhone(e.target.value)}
        placeholder="+91 98765 43210"
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": { borderRadius: "8px" },
        }}
      />
      <TextField
        label="Help email address"
        fullWidth
        type="email"
        value={helpEmail}
        onChange={(e) => setHelpEmail(e.target.value)}
        placeholder="hr@yourcompany.com"
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": { borderRadius: "8px" },
        }}
      />
      <TextField
        label="Office address"
        fullWidth
        multiline
        rows={2}
        value={officeAddress}
        onChange={(e) => setOfficeAddress(e.target.value)}
        placeholder="123 Main Street, Mumbai 400001"
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": { borderRadius: "8px" },
        }}
      />
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>State</InputLabel>
        <Select
          value={workState}
          label="State"
          onChange={(e) => setWorkState(e.target.value)}
          sx={{ borderRadius: "8px" }}
        >
          {states.map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField
        label="Website"
        fullWidth
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        placeholder="https://yourcompany.com"
        sx={{
          mb: 3,
          "& .MuiOutlinedInput-root": { borderRadius: "8px" },
        }}
      />
      <Box sx={{ display: "flex", gap: 1.5 }}>
        <Button
          variant="outline"
          fullWidth
          disabled={loading}
          onClick={onSkip}
          style={{
            borderRadius: "8px",
            borderColor: "var(--text-input-border)",
            color: "var(--text-color)",
            textTransform: "none",
            fontWeight: 500,
          }}
        >
          Skip
        </Button>
        <Button
          variant="primary"
          fullWidth
          size="large"
          disabled={loading}
          loading={loading}
          onClick={onSaveAndContinue}
          style={{
            borderRadius: "8px",
            paddingTop: 11.2,
            paddingBottom: 11.2,
            textTransform: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          Save & Continue
        </Button>
      </Box>
    </>
  );
}
