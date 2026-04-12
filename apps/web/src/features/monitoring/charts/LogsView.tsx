import React, { useState, useEffect, useRef, useCallback } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import TextField from "@mui/material/TextField";

interface LogLine {
  ts: number;
  text: string;
  level: string;
  service: string;
}

const LEVEL_COLORS: Record<string, string> = {
  error: "#f44336",
  warn: "#ff9800",
  warning: "#ff9800",
  info: "#2196f3",
  debug: "#9e9e9e",
};

function levelChipSx(level: string) {
  const color = LEVEL_COLORS[level.toLowerCase()] ?? "#9e9e9e";
  return {
    bgcolor: `${color}22`,
    color,
    fontWeight: 700,
    fontSize: "0.65rem",
    height: 18,
    mr: 1,
  };
}

function parseLevel(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return (obj.level ?? "info").toLowerCase();
  } catch {
    if (/error/i.test(raw)) return "error";
    if (/warn/i.test(raw)) return "warn";
    return "info";
  }
}

interface Props {
  service: string;
}

function LogsView({ service }: Props) {
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [levelFilter, setLevelFilter] = useState("all");
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchLogs = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const svc = service || ".+";
    const end = Math.floor(Date.now() * 1_000_000); // ns
    const start = end - 15 * 60 * 1_000_000_000; // 15 min
    // level filter via json pipeline; if no level label, fall back to plain json
    const levelExpr =
      levelFilter !== "all" ? ` | json | level=~"(?i)${levelFilter}"` : "";
    const query = encodeURIComponent(`{service=~"${svc}"}${levelExpr}`);
    // Vite proxy strips /loki prefix → /api/v1/... goes to localhost:3100
    const url = `/loki/loki/api/v1/query_range?query=${query}&start=${start}&end=${end}&limit=200&direction=BACKWARD`;

    try {
      const res = await window.fetch(url, { signal: ctrl.signal });
      const json = await res.json();
      if (json.status !== "success") return;

      const lines: LogLine[] = [];
      for (const stream of json.data.result ?? []) {
        const svcLabel = stream.stream?.service ?? "?";
        for (const [ts, text] of stream.values ?? []) {
          lines.push({
            ts: Math.floor(parseInt(ts) / 1_000_000),
            text,
            level: stream.stream?.level ?? parseLevel(text),
            service: svcLabel,
          });
        }
      }
      lines.sort((a, b) => b.ts - a.ts);
      setLogs(lines);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [service, levelFilter]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
    const timer = setInterval(fetchLogs, 10_000);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [fetchLogs]);

  const visible = logs.filter((l) => {
    if (search && !l.text.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {/* Filters */}
      <Box
        sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}
      >
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Level</InputLabel>
          <Select
            value={levelFilter}
            label="Level"
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="error">Error</MenuItem>
            <MenuItem value="warn">Warn</MenuItem>
            <MenuItem value="info">Info</MenuItem>
            <MenuItem value="debug">Debug</MenuItem>
          </Select>
        </FormControl>
        <TextField
          size="small"
          label="Search logs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220 }}
        />
        {loading && <CircularProgress size={18} />}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ ml: "auto" }}
        >
          {visible.length} lines · auto-refreshes every 10s
        </Typography>
      </Box>

      {/* Log lines */}
      <Card elevation={1}>
        <CardContent sx={{ p: "0 !important" }}>
          <Box
            sx={{
              fontFamily: "monospace",
              fontSize: "0.75rem",
              maxHeight: 520,
              overflowY: "auto",
              bgcolor: "background.paper",
            }}
          >
            {visible.length === 0 && !loading && (
              <Typography
                color="text.secondary"
                sx={{ p: 3, textAlign: "center" }}
              >
                No logs found. Make sure Loki is running and LOKI_URL is set.
              </Typography>
            )}
            {visible.map((log, i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 1,
                  px: 2,
                  py: 0.5,
                  borderBottom: "1px solid",
                  borderColor: "divider",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Typography
                  variant="caption"
                  color="text.disabled"
                  sx={{ whiteSpace: "nowrap", pt: 0.25, minWidth: 80 }}
                >
                  {new Date(log.ts).toLocaleTimeString()}
                </Typography>
                <Chip
                  label={log.level}
                  size="small"
                  sx={levelChipSx(log.level)}
                />
                <Chip
                  label={log.service}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: "0.6rem", height: 18, mr: 1 }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    wordBreak: "break-all",
                    color:
                      log.level === "error"
                        ? "error.main"
                        : log.level === "warn"
                          ? "warning.main"
                          : "text.primary",
                  }}
                >
                  {log.text}
                </Typography>
              </Box>
            ))}
            <div ref={bottomRef} />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}

export default React.memo(LogsView);
