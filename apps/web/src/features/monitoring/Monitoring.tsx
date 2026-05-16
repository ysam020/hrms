import React, {
  useContext,
  lazy,
  Suspense,
  useMemo,
  useEffect,
  useState,
} from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ToggleButton from "@mui/material/ToggleButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import HttpIcon from "@mui/icons-material/Http";
import MemoryIcon from "@mui/icons-material/Memory";
import HubIcon from "@mui/icons-material/Hub";
import ArticleIcon from "@mui/icons-material/Article";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import type { PrometheusRange } from "./hooks/usePrometheusQuery";

const HttpMetrics = lazy(() => import("./charts/HttpMetrics"));
const NodeMetrics = lazy(() => import("./charts/NodeMetrics"));
const GrpcMetrics = lazy(() => import("./charts/GrpcMetrics"));
const LogsView = lazy(() => import("./charts/LogsView"));

const SERVICES = [
  "all",
  "api-gateway",
  "auth-service",
  "user-service",
  "employee-service",
  "attendance-service",
  "leave-service",
  "recruitment-service",
  "hrm-service",
  "salary-service",
  "analytics-service",
  "notification-service",
  "scheduler-service",
];

const TAB_SLUGS = ["http", "nodejs", "grpc", "logs"];

const Loader = () => (
  <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
    <CircularProgress size={28} />
  </Box>
);

function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ py: 2 }}>{children}</Box>}
    </div>
  );
}

function Monitoring() {
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [service, setService] = useState("all");
  const [range, setRange] = useState<PrometheusRange>("1h");

  const activeTab = useMemo(() => {
    const slug = location.pathname.split("/").pop();
    const idx = TAB_SLUGS.indexOf(slug ?? "");
    return idx >= 0 ? idx : 0;
  }, [location.pathname]);

  useEffect(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || !TAB_SLUGS.includes(parts[1])) {
      navigate("/monitoring/http", { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleTab = (_: any, v: number) => {
    navigate(`/monitoring/${TAB_SLUGS[v]}`);
  };

  const svcQuery = service === "all" ? ".+" : service;

  const tabs = [
    { label: "HTTP", icon: <HttpIcon fontSize="small" /> },
    { label: "Node.js Process", icon: <MemoryIcon fontSize="small" /> },
    { label: "gRPC", icon: <HubIcon fontSize="small" /> },
    { label: "Logs", icon: <ArticleIcon fontSize="small" /> },
  ];

  return (
    <Container maxWidth="xl">
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
          flexWrap: "wrap",
          gap: 1,
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Monitoring
        </Typography>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          {/* Time range */}
          <ToggleButtonGroup
            value={range}
            exclusive
            size="small"
            onChange={(_, v) => v && setRange(v as PrometheusRange)}
          >
            {(["15m", "1h", "6h", "24h"] as PrometheusRange[]).map((r) => (
              <ToggleButton
                key={r}
                value={r}
                sx={{ px: 1.5, fontSize: "0.75rem" }}
              >
                {r}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {/* Service selector */}
          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Service</InputLabel>
            <Select
              value={service}
              label="Service"
              onChange={(e) => setService(e.target.value)}
            >
              {SERVICES.map((s) => (
                <MenuItem key={s} value={s}>
                  {s === "all" ? "All services" : s}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Tooltip title="Grafana dashboard">
            <Typography
              component="a"
              href="http://localhost:3000"
              target="_blank"
              rel="noopener"
              variant="caption"
              color="text.secondary"
              sx={{ textDecoration: "underline", cursor: "pointer" }}
            >
              Open Grafana ↗
            </Typography>
          </Tooltip>
        </Box>
      </Box>

      {/* Tabs */}
      <Paper elevation={1} sx={{ mb: 1 }}>
        <Tabs
          value={activeTab}
          onChange={handleTab}
          variant="scrollable"
          scrollButtons="auto"
        >
          {tabs.map((t, i) => (
            <Tab key={i} label={t.label} icon={t.icon} iconPosition="start" />
          ))}
        </Tabs>
      </Paper>

      <TabPanel value={activeTab} index={0}>
        <Suspense fallback={<Loader />}>
          <HttpMetrics theme={theme} range={range} service={svcQuery} />
        </Suspense>
      </TabPanel>

      <TabPanel value={activeTab} index={1}>
        <Suspense fallback={<Loader />}>
          <NodeMetrics theme={theme} range={range} service={svcQuery} />
        </Suspense>
      </TabPanel>

      <TabPanel value={activeTab} index={2}>
        <Suspense fallback={<Loader />}>
          <GrpcMetrics theme={theme} range={range} service={svcQuery} />
        </Suspense>
      </TabPanel>

      <TabPanel value={activeTab} index={3}>
        <Suspense fallback={<Loader />}>
          <LogsView service={svcQuery} />
        </Suspense>
      </TabPanel>
    </Container>
  );
}

export default React.memo(Monitoring);
