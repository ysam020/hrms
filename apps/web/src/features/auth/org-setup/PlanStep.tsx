import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CheckIcon from "@mui/icons-material/Check";
import Button from "@web/shared/components/Button";
import { alpha } from "@mui/material/styles";
import { PLAN_FEATURES, PRICES } from "./constants";
import type { Billing } from "./types";

export function PlanStep({
  billing,
  setBilling,
  loading,
  onBack,
  onPayAndCreate,
}: {
  billing: Billing;
  setBilling: (v: Billing) => void;
  loading: boolean;
  onBack: () => void;
  onPayAndCreate: () => void;
}) {
  const price = PRICES[billing];

  return (
    <>
      {/* Billing toggle */}
      <Box sx={{ display: "flex", justifyContent: "center", mb: 2.5 }}>
        <ToggleButtonGroup
          value={billing}
          exclusive
          size="small"
          onChange={(_, v) => v && setBilling(v)}
          sx={{
            "& .MuiToggleButton-root": {
              borderRadius: "8px",
              px: 3,
              textTransform: "none",
              fontWeight: 500,
            },
          }}
        >
          <ToggleButton value="monthly">Monthly</ToggleButton>
          <ToggleButton value="annual">Annual</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Plan card */}
      <Box
        sx={{
          border: 2,
          borderColor: "primary.main",
          borderRadius: "10px",
          p: 2.5,
          mb: 2.5,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.04),
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: 1.5,
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700}>
              HRMS Pro
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Full-featured HR management
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="h5" fontWeight={800} color="primary.main">
              {price.display}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {price.sub}
            </Typography>
            {billing === "annual" && "savings" in price && (
              <Typography
                variant="caption"
                display="block"
                color="success.main"
                fontWeight={600}
              >
                {price.savings}
              </Typography>
            )}
          </Box>
        </Box>

        <Divider sx={{ my: 1.5, borderColor: "var(--text-input-border)" }} />

        <List dense disablePadding>
          {PLAN_FEATURES.map((f) => (
            <ListItem key={f} disableGutters sx={{ py: 0.3 }}>
              <ListItemIcon sx={{ minWidth: 28 }}>
                <CheckIcon fontSize="small" color="success" />
              </ListItemIcon>
              <ListItemText
                primary={f}
                primaryTypographyProps={{ variant: "body2" }}
              />
            </ListItem>
          ))}
        </List>
      </Box>

      <Box sx={{ display: "flex", gap: 1.5 }}>
        <Button
          variant="outline"
          fullWidth
          onClick={onBack}
          disabled={loading}
          style={{
            borderRadius: "8px",
            borderColor: "var(--text-input-border)",
            color: "var(--text-color)",
            textTransform: "none",
            fontWeight: 500,
          }}
        >
          Back
        </Button>
        <Button
          variant="primary"
          fullWidth
          size="large"
          disabled={loading}
          onClick={onPayAndCreate}
          loading={loading}
          style={{
            borderRadius: "8px",
            paddingTop: 11.2,
            paddingBottom: 11.2,
            textTransform: "none",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {`Pay ${price.display} & Continue`}
        </Button>
      </Box>

      <Typography
        variant="caption"
        sx={{
          display: "block",
          textAlign: "center",
          mt: 1.5,
          opacity: 0.6,
        }}
      >
        By continuing you agree to our <a href="/terms-of-use">Terms of Use</a>{" "}
        and <a href="/refund-policy">Refund Policy</a>.
      </Typography>
    </>
  );
}
