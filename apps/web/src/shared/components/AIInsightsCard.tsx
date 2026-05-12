import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Alert from "@mui/material/Alert";

import AutoAwesome from "@mui/icons-material/AutoAwesome";
import TrendingUp from "@mui/icons-material/TrendingUp";
import Warning from "@mui/icons-material/Warning";
import Lightbulb from "@mui/icons-material/Lightbulb";
import FiberManualRecord from "@mui/icons-material/FiberManualRecord";

import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

interface AIInsights {
  summary: string;
  patterns: string[];
  risks: string[];
  recommendations: string[];
}

interface AIInsightsCardProps {
  module: string;
  params?: Record<string, string>;
}

export default function AIInsightsCard({
  module,
  params,
}: AIInsightsCardProps) {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.post(API_ENDPOINTS.AI_INSIGHTS, {
        module,
        ...params,
      });
      setInsights(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Failed to generate insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card elevation={1} sx={{ mb: 2 }}>
      <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={insights ? 2 : 0}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <AutoAwesome sx={{ color: "#7c3aed", fontSize: 18 }} />
            <Typography variant="body2" fontWeight={600}>
              AI Insights
            </Typography>
          </Box>
          <Button
            variant="contained"
            size="small"
            onClick={generate}
            disabled={loading}
            startIcon={
              loading ? (
                <CircularProgress size={12} color="inherit" />
              ) : (
                <AutoAwesome sx={{ fontSize: "16px !important" }} />
              )
            }
            sx={{
              bgcolor: "#7c3aed",
              "&:hover": { bgcolor: "#6d28d9" },
              "& .MuiButton-startIcon": { mr: 0.75 },
              py: 0.4,
              px: 1.5,
              fontSize: "0.78rem",
              lineHeight: 1.5,
            }}
          >
            {loading
              ? "Analyzing..."
              : insights
                ? "Regenerate"
                : "Generate Insights"}
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        {insights && (
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, lineHeight: 1.7 }}
            >
              {insights.summary}
            </Typography>

            {insights.patterns.length > 0 && (
              <>
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <TrendingUp sx={{ fontSize: 16, color: "#1976d2" }} />
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    color="#1976d2"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Patterns
                  </Typography>
                </Box>
                <List dense disablePadding sx={{ mb: 1.5 }}>
                  {insights.patterns.map((p, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.4 }}>
                      <ListItemIcon sx={{ minWidth: 20 }}>
                        <FiberManualRecord
                          sx={{ fontSize: 8, color: "#1976d2" }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={p}
                        primaryTypographyProps={{
                          variant: "body2",
                          lineHeight: 1.6,
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {insights.risks.length > 0 && (
              <>
                <Divider sx={{ mb: 1.5 }} />
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <Warning sx={{ fontSize: 16, color: "#f59e0b" }} />
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    color="#f59e0b"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Risks
                  </Typography>
                </Box>
                <List dense disablePadding sx={{ mb: 1.5 }}>
                  {insights.risks.map((r, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.4 }}>
                      <ListItemIcon sx={{ minWidth: 20 }}>
                        <FiberManualRecord
                          sx={{ fontSize: 8, color: "#f59e0b" }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={r}
                        primaryTypographyProps={{
                          variant: "body2",
                          lineHeight: 1.6,
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {insights.recommendations.length > 0 && (
              <>
                <Divider sx={{ mb: 1.5 }} />
                <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                  <Lightbulb sx={{ fontSize: 16, color: "#10b981" }} />
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    color="#10b981"
                    textTransform="uppercase"
                    letterSpacing={0.5}
                  >
                    Recommendations
                  </Typography>
                </Box>
                <List dense disablePadding>
                  {insights.recommendations.map((r, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.4 }}>
                      <ListItemIcon sx={{ minWidth: 20 }}>
                        <FiberManualRecord
                          sx={{ fontSize: 8, color: "#10b981" }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={r}
                        primaryTypographyProps={{
                          variant: "body2",
                          lineHeight: 1.6,
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
