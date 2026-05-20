import React, { useContext, lazy, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
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
import TabsPanel from "@web/shared/components/TabsPanel";
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

function Monitoring() {
  const { theme } = useContext(ThemeContext);
  const [service, setService] = useState("all");
  const [range, setRange] = useState<PrometheusRange>("1h");

  const svcQuery = service === "all" ? ".+" : service;

  const tabData = useMemo(
    () => [
      {
        label: "HTTP",
        slug: "http",
        icon: <HttpIcon fontSize="small" />,
        component: (
          <HttpMetrics theme={theme} range={range} service={svcQuery} />
        ),
      },
      {
        label: "Node.js Process",
        slug: "nodejs",
        icon: <MemoryIcon fontSize="small" />,
        component: (
          <NodeMetrics theme={theme} range={range} service={svcQuery} />
        ),
      },
      {
        label: "gRPC",
        slug: "grpc",
        icon: <HubIcon fontSize="small" />,
        component: (
          <GrpcMetrics theme={theme} range={range} service={svcQuery} />
        ),
      },
      {
        label: "Logs",
        slug: "logs",
        icon: <ArticleIcon fontSize="small" />,
        component: <LogsView service={svcQuery} />,
      },
    ],
    [theme, range, svcQuery],
  );

  return (
    <Box>
      <Container maxWidth="xl" sx={{ py: 1 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 1,
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Monitoring
          </Typography>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
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
      </Container>

      <TabsPanel
        tabData={tabData}
        tabKey="monitoring_tab"
        basePath="/monitoring"
      />
    </Box>
  );
}

export default React.memo(Monitoring);
