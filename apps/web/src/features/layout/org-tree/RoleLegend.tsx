import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import type { Theme } from "@mui/material/styles";
import { getRoleConfig } from "./helpers";

const LEGEND_ITEMS = [
  { role: "CEO", icon: "👑", designation: "CEO" },
  { role: "Manager", icon: "🎯", designation: "MANAGER" },
  { role: "Team Lead", icon: "⭐", designation: "LEAD" },
  { role: "Senior", icon: "🚀", designation: "SENIOR" },
  { role: "Engineer", icon: "👨‍💻", designation: "ENGINEER" },
];

export function RoleLegend({ theme }: { theme: Theme }) {
  return (
    <Paper
      elevation={1}
      sx={{
        p: { xs: 1.25, sm: 1.5 },
        mb: { xs: 0.75, sm: 1 },
        borderRadius: 1,
      }}
    >
      <Typography
        variant="subtitle2"
        sx={{
          mb: { xs: 0.75, sm: 1 },
          fontWeight: 600,
          fontSize: { xs: "0.85rem", sm: "0.875rem" },
        }}
      >
        Role Legend
      </Typography>
      <Box
        sx={{ display: "flex", flexWrap: "wrap", gap: { xs: 0.5, sm: 0.5 } }}
      >
        {LEGEND_ITEMS.map((item, index) => {
          const config = getRoleConfig(item.designation, theme);
          return (
            <Chip
              key={index}
              icon={<span style={{ fontSize: "0.7rem" }}>{item.icon}</span>}
              label={item.role}
              size="small"
              sx={{
                backgroundColor: config.bgColor,
                color: config.color,
                borderColor: config.borderColor,
                border: `1px solid ${config.borderColor}`,
                fontWeight: 500,
                height: { xs: 22, sm: 24 },
                fontSize: { xs: "0.65rem", sm: "0.7rem" },
              }}
            />
          );
        })}
      </Box>
    </Paper>
  );
}
