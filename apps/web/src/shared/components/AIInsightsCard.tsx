import { useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@web/shared/components/Button";
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

// Extracts the summary text from a partial JSON stream without regex,
// so raw JSON structure never leaks into the display.
const extractStreamingSummary = (raw: string): string => {
  const markerIdx = raw.indexOf('"summary"');
  if (markerIdx === -1) return "";

  const colonIdx = raw.indexOf(":", markerIdx + 9);
  if (colonIdx === -1) return "";

  const openQuoteIdx = raw.indexOf('"', colonIdx + 1);
  if (openQuoteIdx === -1) return "";

  let content = "";
  let i = openQuoteIdx + 1;
  while (i < raw.length) {
    if (raw[i] === '"' && raw[i - 1] !== "\\") break;
    if (raw[i] === "\\" && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === "n") {
        content += "\n";
        i += 2;
        continue;
      }
      if (next === '"') {
        content += '"';
        i += 2;
        continue;
      }
      if (next === "\\") {
        content += "\\";
        i += 2;
        continue;
      }
      content += next;
      i += 2;
      continue;
    }
    content += raw[i];
    i++;
  }
  return content;
};

const extractStreamingArray = (raw: string, key: string): string[] => {
  const markerIdx = raw.indexOf(`"${key}"`);
  if (markerIdx === -1) return [];

  const bracketIdx = raw.indexOf("[", markerIdx);
  if (bracketIdx === -1) return [];

  const items: string[] = [];
  let i = bracketIdx + 1;

  while (i < raw.length) {
    while (i < raw.length && " \n\r\t".includes(raw[i])) i++;
    if (i >= raw.length || raw[i] === "]") break;
    if (raw[i] === ",") {
      i++;
      continue;
    }

    if (raw[i] === '"') {
      let item = "";
      i++;
      let closed = false;
      while (i < raw.length) {
        if (raw[i] === '"' && raw[i - 1] !== "\\") {
          closed = true;
          break;
        }
        if (raw[i] === "\\" && i + 1 < raw.length) {
          const next = raw[i + 1];
          if (next === "n") {
            item += "\n";
            i += 2;
            continue;
          }
          if (next === '"') {
            item += '"';
            i += 2;
            continue;
          }
          if (next === "\\") {
            item += "\\";
            i += 2;
            continue;
          }
          item += next;
          i += 2;
          continue;
        }
        item += raw[i];
        i++;
      }
      items.push(item);
      if (closed) i++;
    } else {
      i++;
    }
  }

  return items;
};

export default function AIInsightsCard({
  module,
  params,
}: AIInsightsCardProps) {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");

  const streamingSummary =
    loading && !insights ? extractStreamingSummary(streamingText) : "";
  const streamingPatterns =
    loading && !insights
      ? extractStreamingArray(streamingText, "patterns")
      : [];
  const streamingRisks =
    loading && !insights ? extractStreamingArray(streamingText, "risks") : [];
  const streamingRecommendations =
    loading && !insights
      ? extractStreamingArray(streamingText, "recommendations")
      : [];

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

  return (
    <Card elevation={1} sx={{ mb: 2 }}>
      <CardContent sx={{ py: 1.25, "&:last-child": { pb: 1.25 } }}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={loading || insights ? 2 : 0}
        >
          <Box display="flex" alignItems="center" gap={1}>
            <AutoAwesome sx={{ color: "#7c3aed", fontSize: 18 }} />
            <Typography variant="body2" fontWeight={600}>
              AI Insights
            </Typography>
          </Box>
          <Button
            variant="primary"
            size="small"
            onClick={generate}
            disabled={loading}
            loading={loading}
            loadingText="Analyzing..."
            icon={<AutoAwesome style={{ fontSize: "16px" }} />}
            style={{
              backgroundColor: "#7c3aed",
              paddingTop: 3.2,
              paddingBottom: 3.2,
              paddingLeft: 12,
              paddingRight: 12,
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
              {insights ? "Regenerate" : "Generate Insights"}
            </span>
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}

        {/* Streaming phase: progressively reveal summary then bullet sections */}
        {loading && !insights && (
          <Box>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: streamingPatterns.length > 0 ? 2 : 0, lineHeight: 1.7 }}
            >
              {streamingSummary}
              {streamingPatterns.length === 0 && (
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

            {streamingPatterns.length > 0 && (
              <>
                <Divider sx={{ mb: 1.5, mt: 1.5 }} />
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
                  {streamingPatterns.map((p, i) => (
                    <ListItem
                      key={i}
                      disablePadding
                      sx={{
                        p: 0,
                        m: 0,
                        "&:hover": { backgroundColor: "transparent" },
                      }}
                    >
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

            {streamingRisks.length > 0 && (
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
                  {streamingRisks.map((r, i) => (
                    <ListItem
                      key={i}
                      disablePadding
                      sx={{
                        p: 0,
                        m: 0,
                        "&:hover": { backgroundColor: "transparent" },
                      }}
                    >
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

            {streamingRecommendations.length > 0 && (
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
                  {streamingRecommendations.map((r, i) => (
                    <ListItem
                      key={i}
                      disablePadding
                      sx={{
                        p: 0,
                        m: 0,
                        "&:hover": { backgroundColor: "transparent" },
                      }}
                    >
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
          </Box>
        )}

        {/* Final phase: full structured layout */}
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
                <Divider sx={{ mb: 1.5, mt: 1.5 }} />
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
                  {insights.patterns.map((p: string, i: number) => (
                    <ListItem
                      key={i}
                      disablePadding
                      sx={{
                        p: 0,
                        m: 0,
                        "&:hover": { backgroundColor: "transparent" },
                      }}
                    >
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
                  {insights.risks.map((r: string, i: number) => (
                    <ListItem
                      key={i}
                      disablePadding
                      sx={{
                        p: 0,
                        m: 0,
                        "&:hover": { backgroundColor: "transparent" },
                      }}
                    >
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
                  {insights.recommendations.map((r: string, i: number) => (
                    <ListItem
                      key={i}
                      disablePadding
                      sx={{
                        p: 0,
                        m: 0,
                        "&:hover": { backgroundColor: "transparent" },
                      }}
                    >
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
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
