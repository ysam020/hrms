import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";

export function JoinOfferPrompt({
  tenantName,
  previousRejected,
  submitting,
  onRequestJoin,
}: {
  tenantName: string;
  previousRejected: boolean;
  submitting: boolean;
  onRequestJoin: () => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {previousRejected && (
        <Typography variant="caption" sx={{ color: "warning.main" }}>
          Your previous request was declined.
        </Typography>
      )}
      <Typography variant="body2" sx={{ color: "var(--text-color)" }}>
        <strong>{tenantName}</strong> already has a workspace for your email
        domain. Request to join to continue.
      </Typography>
      <Button
        variant="primary"
        fullWidth
        size="large"
        disabled={submitting}
        loading={submitting}
        onClick={onRequestJoin}
        style={{
          borderRadius: "8px",
          paddingTop: 11.2,
          paddingBottom: 11.2,
          textTransform: "none",
          fontWeight: 600,
          fontSize: 15,
        }}
      >
        Request to join
      </Button>
    </Box>
  );
}
