import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Skeleton from "@mui/material/Skeleton";
import Tooltip from "@mui/material/Tooltip";

export const SectionLabel = ({ children }) => (
  <Typography
    variant="caption"
    sx={{
      display: "block",
      color: "text.secondary",
      fontWeight: 700,
      fontSize: "0.62rem",
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      mb: 0.75,
    }}
  >
    {children}
  </Typography>
);

export const ActionBtn = ({ icon, label, onClick, isDark }) => (
  <Tooltip title={label} placement="top" arrow>
    <Box
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0.4,
        py: 1,
        borderRadius: 2,
        border: "1px solid",
        borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "all 0.15s",
        "&:hover": {
          bgcolor: "primary.main",
          borderColor: "primary.main",
          "& .action-icon, & .action-label": { color: "#fff" },
        },
      }}
    >
      <Box
        className="action-icon"
        sx={{ color: "text.secondary", display: "flex", fontSize: 18 }}
      >
        {icon}
      </Box>
      <Typography
        className="action-label"
        variant="caption"
        sx={{
          color: "text.secondary",
          fontSize: "0.6rem",
          fontWeight: 600,
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        {label}
      </Typography>
    </Box>
  </Tooltip>
);

export const StatPill = ({ label, value, color, isLoading }) => (
  <Box
    sx={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      py: 0.6,
      borderRadius: 1.5,
      bgcolor: `${color}12`,
      border: `1px solid ${color}28`,
    }}
  >
    {isLoading ? (
      <Skeleton width={20} height={18} sx={{ transform: "none" }} />
    ) : (
      <Typography
        fontWeight={800}
        sx={{ fontSize: "0.95rem", color, lineHeight: 1 }}
      >
        {value ?? 0}
      </Typography>
    )}
    <Typography
      variant="caption"
      sx={{
        fontSize: "0.55rem",
        color: "text.secondary",
        mt: 0.2,
        textAlign: "center",
        lineHeight: 1.2,
      }}
    >
      {label}
    </Typography>
  </Box>
);
