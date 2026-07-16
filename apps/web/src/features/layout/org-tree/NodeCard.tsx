import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import { alpha } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { getRoleConfig } from "./helpers";
import type { Employee } from "./types";

export const NodeCard = ({
  employee,
  depth,
  theme,
  onClick,
}: {
  employee: Employee;
  depth: number;
  theme: Theme;
  onClick: () => void;
}) => {
  const config = getRoleConfig(employee.designation, theme);
  const initials = `${employee.first_name?.[0] ?? ""}${employee.last_name?.[0] ?? ""}`;
  const solid = depth === 0;
  const textColor = solid
    ? theme.palette.getContrastText(config.color)
    : theme.palette.text.primary;

  return (
    <Box
      onClick={onClick}
      sx={{
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        minWidth: depth === 0 ? 190 : depth === 1 ? 165 : 135,
        px: depth === 0 ? 2.25 : 1.5,
        py: depth === 0 ? 1.25 : 0.875,
        borderRadius: 3,
        border: `1.5px solid ${config.borderColor}`,
        backgroundColor: solid
          ? config.color
          : alpha(config.color, depth === 1 ? 0.28 : 0.12),
        boxShadow: theme.shadows[1],
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        "&:hover": {
          transform: "translateY(-2px)",
          boxShadow: theme.shadows[4],
        },
      }}
    >
      <Avatar
        src={employee.employee_photo || undefined}
        sx={{
          width: depth === 0 ? 38 : 30,
          height: depth === 0 ? 38 : 30,
          fontSize: "0.72rem",
          fontWeight: 700,
          backgroundColor: solid ? alpha("#fff", 0.25) : config.color,
          color: solid
            ? theme.palette.getContrastText(config.color)
            : theme.palette.getContrastText(config.color),
        }}
      >
        {initials}
      </Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="body2"
          noWrap
          sx={{
            fontWeight: 700,
            fontSize: depth === 0 ? "0.88rem" : "0.78rem",
            color: textColor,
          }}
        >
          {employee.first_name} {employee.last_name}
        </Typography>
        <Typography
          variant="caption"
          noWrap
          sx={{
            display: "block",
            fontSize: "0.66rem",
            fontWeight: 600,
            color: solid ? alpha(textColor, 0.85) : config.color,
          }}
        >
          {config.icon} {employee.designation || employee.department}
        </Typography>
      </Box>
    </Box>
  );
};
