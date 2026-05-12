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

import { getAccessToken, fetchCsrfToken } from "@web/core/http/axiosConfig";
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

const parseInsights = (text: string): AIInsights => {
  const raw = JSON.parse(text.match(/\{[\s\S]*\}/)![0]);
  return {
    summary: typeof raw.summary === "string" ? raw.summary : "",
    patterns: Array.isArray(raw.patterns) ? raw.patterns : [],
    risks: Array.isArray(raw.risks) ? raw.risks : [],
    recommendations: Array.isArray(raw.recommendations)
      ? raw.recommendations
      : [],
  };
};

const parsePartialInsights = (raw: string): AIInsights => {
  const summaryMatch = raw.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)/);
  const summary = summaryMatch
    ? summaryMatch[1]
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\")
    : "";

  const extractItems = (field: string): string[] => {
    const fieldMatch = raw.match(
      new RegExp(`"${field}"\\s*:\\s*\\[([\\s\\S]*?)(?:\\]|$)`),
    );
    if (!fieldMatch) return [];
    const items: string[] = [];
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fieldMatch[1])) !== null) {
      items.push(
        m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\"),
      );
    }
    return items;
  };

  return {
    summary,
    patterns: extractItems("patterns"),
    risks: extractItems("risks"),
    recommendations: extractItems("recommendations"),
  };
};

export default function AIInsightsCard({
  module,
  params,
}: AIInsightsCardProps) {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");

  const displayInsights: AIInsights | null =
    insights ??
    (loading && streamingText ? parsePartialInsights(streamingText) : null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setInsights(null);
    setStreamingText("");

    let accumulated = "";

    try {
      const token = getAccessToken();
      const csrfToken = await fetchCsrfToken();

      const res = await fetch(
        `${import.meta.env.VITE_API_STRING}${API_ENDPOINTS.AI_INSIGHTS}`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(token && { Authorization: `Bearer ${token}` }),
            "x-csrf-token": csrfToken,
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ module, ...params }),
        },
      );

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message ?? `Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.error) throw new Error(payload.error);
            if (payload.token) {
              accumulated += payload.token;
              setStreamingText(accumulated);
            }
            if (payload.done) {
              setInsights(parseInsights(accumulated));
              setStreamingText("");
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
          }
        }
      }
    } catch (err: any) {
      setError(err.message ?? "Failed to generate insights");
    } finally {
      setLoading(false);
      setStreamingText("");
    }
  };

  const summaryStreaming =
    loading && displayInsights && !displayInsights.patterns.length;

  return (
    <Card elevation={1} sx={{ mb: 2 }}>
      <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={displayInsights ? 2 : 0}
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
              py: 0.4,
              px: 1.5,
              fontSize: "0.78rem",
              lineHeight: 1.5,
            }}
          >
            <span
              style={{
                display: "inline-block",
                transform: "translateY(-1px)",
                marginLeft: "6px",
              }}
            >
              {loading
                ? "Analyzing..."
                : insights
                  ? "Regenerate"
                  : "Generate Insights"}
            </span>
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        {displayInsights && (
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 2, lineHeight: 1.7 }}
            >
              {displayInsights.summary}
              {summaryStreaming && (
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    width: "2px",
                    height: "1em",
                    bgcolor: "text.secondary",
                    ml: 0.25,
                    verticalAlign: "text-bottom",
                    "@keyframes blink": { "50%": { opacity: 0 } },
                    animation: "blink 1s step-end infinite",
                  }}
                />
              )}
            </Typography>

            {displayInsights.patterns.length > 0 && (
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
                  {displayInsights.patterns.map((p, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.4 }}>
                      <ListItemIcon sx={{ minWidth: 20 }}>
                        <FiberManualRecord
                          sx={{ fontSize: 8, color: "#1976d2" }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={p}
                        slotProps={{
                          primary: {
                            variant: "body2",
                            style: { lineHeight: 1.6 },
                          },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {displayInsights.risks.length > 0 && (
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
                  {displayInsights.risks.map((r, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.4 }}>
                      <ListItemIcon sx={{ minWidth: 20 }}>
                        <FiberManualRecord
                          sx={{ fontSize: 8, color: "#f59e0b" }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={r}
                        slotProps={{
                          primary: {
                            variant: "body2",
                            style: { lineHeight: 1.6 },
                          },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {displayInsights.recommendations.length > 0 && (
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
                  {displayInsights.recommendations.map((r, i) => (
                    <ListItem key={i} disablePadding sx={{ py: 0.4 }}>
                      <ListItemIcon sx={{ minWidth: 20 }}>
                        <FiberManualRecord
                          sx={{ fontSize: 8, color: "#10b981" }}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={r}
                        slotProps={{
                          primary: {
                            variant: "body2",
                            style: { lineHeight: 1.6 },
                          },
                        }}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {loading && (
              <Box display="flex" alignItems="center" gap={0.75} mt={1.5}>
                <CircularProgress size={10} sx={{ color: "#7c3aed" }} />
                <Typography variant="caption" color="text.disabled">
                  Generating...
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
