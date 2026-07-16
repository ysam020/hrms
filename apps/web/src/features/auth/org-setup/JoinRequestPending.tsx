import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";

export function JoinRequestPending({
  tenantName,
  checkingDomain,
  onCheckAgain,
}: {
  tenantName: string | undefined;
  checkingDomain: boolean;
  onCheckAgain: () => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="body2" sx={{ color: "var(--text-color)" }}>
        Your request to join <strong>{tenantName}</strong> is waiting for
        approval from an admin. Check back once they've reviewed it.
      </Typography>
      <Button
        variant="primary"
        fullWidth
        size="large"
        disabled={checkingDomain}
        loading={checkingDomain}
        onClick={onCheckAgain}
        style={{
          borderRadius: "8px",
          paddingTop: 11.2,
          paddingBottom: 11.2,
          textTransform: "none",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Check again
      </Button>
    </Box>
  );
}
