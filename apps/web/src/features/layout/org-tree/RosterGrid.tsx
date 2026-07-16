import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { alpha } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { getRoleConfig } from "./helpers";
import type { Employee } from "./types";

export const RosterGrid = ({
  members,
  theme,
  onSelect,
}: {
  members: Employee[];
  theme: Theme;
  onSelect: (employee: Employee) => void;
}) => (
  <Paper
    variant="outlined"
    sx={{
      p: 1.25,
      borderRadius: 2,
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
      gap: 0.75,
      maxWidth: 560,
      backgroundColor: alpha(theme.palette.text.primary, 0.02),
    }}
  >
    {members.map((member) => {
      const config = getRoleConfig(member.designation, theme);
      const initials = `${member.first_name?.[0] ?? ""}${member.last_name?.[0] ?? ""}`;
      return (
        <Box
          key={member.username}
          onClick={() => onSelect(member)}
          sx={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            p: 0.75,
            borderRadius: 1.5,
            border: `1px solid ${config.borderColor}`,
            backgroundColor: alpha(config.color, 0.1),
            transition: "background-color 0.15s ease",
            "&:hover": { backgroundColor: alpha(config.color, 0.2) },
          }}
        >
          <Avatar
            src={member.employee_photo || undefined}
            sx={{
              width: 24,
              height: 24,
              fontSize: "0.6rem",
              fontWeight: 700,
              backgroundColor: config.color,
            }}
          >
            {initials}
          </Avatar>
          <Typography
            variant="caption"
            noWrap
            sx={{ fontWeight: 600, fontSize: "0.68rem" }}
          >
            {member.first_name} {member.last_name}
          </Typography>
        </Box>
      );
    })}
  </Paper>
);
