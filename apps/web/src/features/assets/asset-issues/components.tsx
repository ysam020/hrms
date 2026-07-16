import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import { STATUS_CFG, PRIORITY_CFG } from "./constants";

export function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.open;
  const label = status.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: "0.7rem",
        height: 22,
        borderRadius: "4px",
        "& .MuiChip-label": { padding: "0 8px" },
      }}
    />
  );
}

export function PriorityLabel({ priority }: { priority: string }) {
  const cfg = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium;
  return (
    <Typography
      variant="body2"
      fontSize="0.8rem"
      fontWeight={600}
      sx={{ color: cfg.color }}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </Typography>
  );
}

export function DetailRow({ label, value }: { label: string; value: any }) {
  return (
    <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
      <Typography
        variant="caption"
        sx={{
          minWidth: 110,
          flexShrink: 0,
          color: "text.secondary",
          fontWeight: 500,
          pt: "1px",
        }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
        {value || <span style={{ fontStyle: "italic" }}>—</span>}
      </Typography>
    </Box>
  );
}
