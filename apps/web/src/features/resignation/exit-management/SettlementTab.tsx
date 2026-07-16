import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@web/shared/components/Button";
import type { FnfSettlement } from "./types";

export function SettlementTab({
  settlement,
  computingSettlement,
  onCompute,
  onApprove,
}: {
  settlement: FnfSettlement | null;
  computingSettlement: boolean;
  onCompute: () => void;
  onApprove: () => void;
}) {
  return (
    <Box>
      <Button
        variant="primary"
        size="small"
        onClick={onCompute}
        disabled={computingSettlement}
        loading={computingSettlement}
        style={{ marginTop: 0, marginBottom: 16 }}
      >
        {settlement ? "Recompute" : "Compute settlement"}
      </Button>
      {settlement && (
        <Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            {settlement.lineItems.map((li) => (
              <Box
                key={`${li.label}-${li.amount}`}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  px: 2,
                  py: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2">{li.label}</Typography>
                <Typography variant="body2">
                  {li.type === "deduction" ? "-" : ""}₹{li.amount.toFixed(2)}
                </Typography>
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              px: 2,
              py: 1.25,
              mt: 0.5,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            <Typography sx={{ fontWeight: 700 }}>Net payable</Typography>
            <Typography sx={{ fontWeight: 700 }}>
              ₹{settlement.netPayable.toFixed(2)}
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mt: 2,
            }}
          >
            <Chip
              size="small"
              label={settlement.status}
              color={settlement.status === "approved" ? "success" : "default"}
            />
            {settlement.status === "draft" && (
              <Button size="small" variant="primary" onClick={onApprove}>
                Approve settlement
              </Button>
            )}
          </Box>
        </Box>
      )}
    </Box>
  );
}
