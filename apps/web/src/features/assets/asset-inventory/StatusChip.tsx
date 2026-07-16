import Chip from "@mui/material/Chip";
import { STATUS_CFG } from "./constants";

export function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.available;
  return (
    <Chip
      label={status}
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
