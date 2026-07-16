import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Button from "@web/shared/components/Button";
import type { Tenant } from "./types";

export function TenantPicker({
  tenants,
  loading,
  onSelect,
}: {
  tenants: Tenant[];
  loading: boolean;
  onSelect: (tenantId: string) => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {tenants.map((t) => (
        <Button
          key={t.id}
          variant="outline"
          fullWidth
          disabled={loading}
          onClick={() => onSelect(t.id)}
          style={{
            justifyContent: "space-between",
            paddingTop: 12,
            paddingBottom: 12,
            paddingLeft: 16,
            paddingRight: 16,
            borderRadius: "8px",
            borderColor: "var(--text-input-border)",
            color: "var(--text-color)",
          }}
        >
          <Box sx={{ textAlign: "left" }}>
            <Typography fontWeight={600} color="var(--text-color-secondary)">
              {t.name}
            </Typography>
            <Typography
              variant="caption"
              color="var(--text-color)"
              sx={{ opacity: 0.6 }}
            >
              {t.slug}
            </Typography>
          </Box>
          <Chip
            label={t.role}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Button>
      ))}
    </Box>
  );
}
