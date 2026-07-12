import { memo, useContext, useEffect, useState } from "react";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import DevicesIcon from "@mui/icons-material/Devices";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PersonIcon from "@mui/icons-material/Person";
import BuildIcon from "@mui/icons-material/Build";
import ArchiveIcon from "@mui/icons-material/Archive";
import { API_ENDPOINTS } from "@web/shared/constants";

interface SummaryCard {
  label: string;
  value: number;
  icon: any;
  color: string;
  bg: string;
}

function StatCard({ label, value, icon: Icon, color, bg }: SummaryCard) {
  const { theme } = useContext(ThemeContext);
  return (
    <Paper
      elevation={0}
      sx={{
        p: 3,
        borderRadius: "12px",
        border: `1px solid ${theme === "light" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"}`,
        display: "flex",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: "12px",
          backgroundColor: bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon sx={{ fontSize: 24, color }} />
      </Box>
      <Box>
        <Typography variant="h4" fontWeight={700} fontSize="1.8rem">
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" fontSize="0.8rem">
          {label}
        </Typography>
      </Box>
    </Paper>
  );
}

function AssetSummary() {
  const { setAlert } = useContext(AlertContext);
  const [summary, setSummary] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient(API_ENDPOINTS.ASSET_SUMMARY)
      .then((res) => setSummary(res.data.data))
      .catch(() =>
        setAlert({
          open: true,
          message: "Failed to load asset summary",
          severity: "error",
        }),
      )
      .finally(() => setLoading(false));
  }, [setAlert]);

  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  if (!summary) return null;

  const byStatus = (summary.byStatus as Record<string, number>) ?? {};

  const cards: SummaryCard[] = [
    {
      label: "Total Assets",
      value: summary.total ?? 0,
      icon: DevicesIcon,
      color: "#6366f1",
      bg: "rgba(99,102,241,0.12)",
    },
    {
      label: "Available",
      value: byStatus.available ?? 0,
      icon: CheckCircleIcon,
      color: "#059669",
      bg: "rgba(5,150,105,0.12)",
    },
    {
      label: "Assigned",
      value: byStatus.assigned ?? 0,
      icon: PersonIcon,
      color: "#3b82f6",
      bg: "rgba(59,130,246,0.12)",
    },
    {
      label: "In Maintenance",
      value: byStatus.maintenance ?? 0,
      icon: BuildIcon,
      color: "#d97706",
      bg: "rgba(217,119,6,0.12)",
    },
    {
      label: "Retired",
      value: byStatus.retired ?? 0,
      icon: ArchiveIcon,
      color: "#64748b",
      bg: "rgba(100,116,139,0.12)",
    },
  ];

  return (
    <Box sx={{ p: 1 }}>
      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={card.label}>
            <StatCard {...card} />
          </Grid>
        ))}
      </Grid>

      {summary.byCategory && Object.keys(summary.byCategory).length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            By Category
          </Typography>
          <Grid container spacing={1.5}>
            {Object.entries(summary.byCategory).map(([category, count]) => (
              <Grid item key={category}>
                <Paper
                  elevation={0}
                  sx={{
                    px: 2,
                    py: 1,
                    borderRadius: "8px",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {category}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    fontSize="0.8rem"
                  >
                    {count as number} asset{(count as number) !== 1 ? "s" : ""}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}
    </Box>
  );
}

export default memo(AssetSummary);
