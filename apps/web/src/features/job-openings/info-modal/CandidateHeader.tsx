import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid2";
import InfoIcon from "@mui/icons-material/Info";
import PersonIcon from "@mui/icons-material/Person";
import EmailIcon from "@mui/icons-material/Email";
import { getStatusColor } from "./helpers";

export function CandidateHeader({
  jobTitle,
  name,
  email,
  status,
}: {
  jobTitle: string | undefined;
  name: string | undefined;
  email: string | undefined;
  status: string;
}) {
  return (
    <>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <Avatar
            sx={{
              width: 40,
              height: 40,
              bgcolor: "info.main",
              color: "white",
            }}
          >
            <InfoIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography
              variant="h6"
              fontWeight={600}
              sx={{ fontSize: "1.1rem" }}
            >
              Candidate Details
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {jobTitle}
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Candidate Information */}
      <Box sx={{ p: 2 }}>
        <Typography
          variant="subtitle2"
          color="text.secondary"
          gutterBottom
          sx={{ mb: 2 }}
        >
          Personal Information
        </Typography>
        <Grid container spacing={1} sx={{ mb: 2 }}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Chip
              icon={<PersonIcon />}
              label={`Name: ${name || "N/A"}`}
              variant="outlined"
              sx={{ width: "100%", justifyContent: "flex-start" }}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Chip
              icon={<EmailIcon />}
              label={`Email: ${email || "N/A"}`}
              variant="outlined"
              sx={{ width: "100%", justifyContent: "flex-start" }}
            />
          </Grid>
        </Grid>

        {/* Current Status */}
        <Box sx={{ mb: 1 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Current Status
          </Typography>
          <Chip
            label={status || "No Status"}
            color={getStatusColor(status)}
            variant="filled"
            sx={{ fontWeight: 500 }}
          />
        </Box>
      </Box>
    </>
  );
}
