import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Button from "@web/shared/components/Button";
import WorkWeekPicker, {
  type WorkWeekValue,
} from "@web/shared/components/WorkWeekPicker";
import { COMPANY_SIZES, INDUSTRIES } from "./constants";

export function OrgDetailsStep({
  orgName,
  setOrgName,
  industry,
  setIndustry,
  companySize,
  setCompanySize,
  workWeek,
  setWorkWeek,
  onContinue,
}: {
  orgName: string;
  setOrgName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  companySize: string;
  setCompanySize: (v: string) => void;
  workWeek: WorkWeekValue;
  setWorkWeek: (v: WorkWeekValue) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <TextField
        label="Organisation name"
        fullWidth
        value={orgName}
        onChange={(e) => setOrgName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && orgName.trim() && onContinue()}
        placeholder="Acme Corp"
        sx={{
          mb: 2,
          "& .MuiOutlinedInput-root": { borderRadius: "8px" },
        }}
      />

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Industry</InputLabel>
        <Select
          value={industry}
          label="Industry"
          onChange={(e) => setIndustry(e.target.value)}
          sx={{ borderRadius: "8px" }}
        >
          {INDUSTRIES.map((i) => (
            <MenuItem key={i} value={i}>
              {i}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Company size</InputLabel>
        <Select
          value={companySize}
          label="Company size"
          onChange={(e) => setCompanySize(e.target.value)}
          sx={{ borderRadius: "8px" }}
        >
          {COMPANY_SIZES.map((s) => (
            <MenuItem key={s} value={s}>
              {s} employees
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ mb: 3 }}>
        <WorkWeekPicker value={workWeek} onChange={setWorkWeek} />
      </Box>

      <Button
        variant="primary"
        fullWidth
        size="large"
        disabled={!orgName.trim()}
        onClick={onContinue}
        style={{
          borderRadius: "8px",
          paddingTop: 11.2,
          paddingBottom: 11.2,
          fontWeight: 600,
          textTransform: "none",
          fontSize: 15,
        }}
      >
        Continue
      </Button>
    </>
  );
}
