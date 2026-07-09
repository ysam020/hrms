import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import dayjs from "dayjs";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import ReplayIcon from "@mui/icons-material/Replay";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_CFG: Record<string, { color: string; bg: string }> = {
  pending: { color: "#d97706", bg: "rgba(217,119,6,0.15)" },
  success: { color: "#059669", bg: "rgba(5,150,105,0.15)" },
  failed: { color: "#dc2626", bg: "rgba(220,38,38,0.15)" },
  retrying: { color: "#6366f1", bg: "rgba(99,102,241,0.15)" },
};

function StatusChip({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.pending;
  return (
    <Chip
      label={status}
      size="small"
      sx={{
        backgroundColor: cfg.bg,
        color: cfg.color,
        fontWeight: 600,
        fontSize: "0.7rem",
        height: 22,
        borderRadius: "4px",
        "& .MuiChip-label": { padding: "0 8px" },
      }}
    />
  );
}

function WebhookDeliveries() {
  const { setAlert } = useContext(AlertContext);
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState("");
  const [loadingEndpoints, setLoadingEndpoints] = useState(true);

  useEffect(() => {
    apiClient(API_ENDPOINTS.WEBHOOK_ENDPOINTS)
      .then((res) => {
        const eps = res.data.data || [];
        setEndpoints(eps);
        if (eps.length > 0) setSelectedEndpoint(eps[0].id);
      })
      .catch(() =>
        setAlert({
          open: true,
          message: "Failed to load endpoints",
          severity: "error",
        }),
      )
      .finally(() => setLoadingEndpoints(false));
  }, [setAlert]);

  const fetchDeliveries = useCallback(
    async ({ page, limit }) => {
      if (!selectedEndpoint) return { data: [], totalCount: 0 };
      try {
        const res = await apiClient(
          API_ENDPOINTS.WEBHOOK_DELIVERIES(selectedEndpoint, page, limit),
        );
        return { data: res.data.data || [], totalCount: res.data.total || 0 };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch deliveries",
          severity: "error",
        });
        throw err;
      }
    },
    [selectedEndpoint, setAlert],
  );

  const {
    data,
    loading,
    totalCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
    refresh,
  } = useServerPagination(fetchDeliveries, {
    initialPageSize: 20,
    deps: [selectedEndpoint],
  });

  const handleRetry = useCallback(
    async (deliveryId: string) => {
      try {
        await apiClient.post(API_ENDPOINTS.RETRY_WEBHOOK_DELIVERY(deliveryId));
        refresh();
        setAlert({
          open: true,
          message: "Delivery queued for retry",
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message: err?.response?.data?.message || "Retry failed",
          severity: "error",
        });
      }
    },
    [refresh, setAlert],
  );

  const columns = useMemo(
    () => [
      {
        key: "eventType",
        label: "Event",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Typography
            component="span"
            variant="body2"
            fontSize="0.8rem"
            fontWeight={600}
            sx={{ fontFamily: "monospace" }}
          >
            {row.eventType}
          </Typography>
        ),
      },
      {
        key: "status",
        label: "Status",
        hideLabel: true,
        render: (row: any) => <StatusChip status={row.status} />,
      },
      {
        key: "httpStatus",
        label: "HTTP",
        render: (row: any) => {
          const code = row.httpStatus;
          const color =
            code >= 200 && code < 300
              ? "success.main"
              : code
                ? "error.main"
                : "text.secondary";
          return (
            <Box component="span" sx={{ color, fontWeight: 600 }}>
              {code ?? "—"}
            </Box>
          );
        },
      },
      {
        key: "attempts",
        label: "Attempts",
        render: (row: any) => row.attempts ?? 0,
      },
      {
        key: "error",
        label: "Error",
        render: (row: any) =>
          row.error ? (
            <Box component="span" sx={{ color: "error.main" }}>
              {row.error}
            </Box>
          ) : null,
      },
      {
        key: "createdAt",
        label: "Sent At",
        render: (row: any) => dayjs(row.createdAt).format("DD MMM, HH:mm:ss"),
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => {
      if (row.status === "success") return [];
      return [
        {
          icon: <ReplayIcon sx={{ fontSize: 16 }} />,
          label: "Retry delivery",
          color: "primary" as const,
          onClick: () => handleRetry(row.id),
        },
      ];
    },
    [handleRetry],
  );

  const memoizedData = useMemo(() => data || [], [data]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Webhook deliveries"
        data={memoizedData}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No deliveries found"
        toolbarActions={
          loadingEndpoints ? (
            <CircularProgress size={20} />
          ) : (
            <TextField
              select
              size="small"
              label="Endpoint"
              value={selectedEndpoint}
              onChange={(e) => setSelectedEndpoint(e.target.value)}
              sx={{ minWidth: 280 }}
            >
              {endpoints.length === 0 ? (
                <MenuItem value="">No endpoints</MenuItem>
              ) : (
                endpoints.map((ep) => (
                  <MenuItem key={ep.id} value={ep.id}>
                    {ep.url}
                  </MenuItem>
                ))
              )}
            </TextField>
          )
        }
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [10, 20, 50, 100],
        }}
      />
    </ErrorBoundary>
  );
}

export default memo(WebhookDeliveries);
