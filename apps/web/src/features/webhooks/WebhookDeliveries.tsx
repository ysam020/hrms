import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import dayjs from "dayjs";
import useTableConfig from "@web/shared/hooks/useTableConfig";
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
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
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
        accessorKey: "eventType",
        header: "Event",
        size: 180,
        Cell: ({ cell }: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            sx={{ fontFamily: "monospace" }}
          >
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 100,
        Cell: ({ cell }: any) => <StatusChip status={cell.getValue()} />,
      },
      {
        accessorKey: "httpStatus",
        header: "HTTP",
        size: 80,
        Cell: ({ cell }: any) => {
          const code = cell.getValue();
          const color =
            code >= 200 && code < 300
              ? "#059669"
              : code
                ? "#dc2626"
                : "#64748b";
          return (
            <Typography
              variant="body2"
              fontSize="0.8rem"
              fontWeight={600}
              color={color}
            >
              {code ?? "—"}
            </Typography>
          );
        },
      },
      {
        accessorKey: "attempts",
        header: "Attempts",
        size: 90,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() ?? 0}
          </Typography>
        ),
      },
      {
        accessorKey: "error",
        header: "Error",
        size: 220,
        Cell: ({ cell }: any) => (
          <Typography
            variant="body2"
            fontSize="0.75rem"
            color="error.main"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {cell.getValue() ?? ""}
          </Typography>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Sent At",
        size: 140,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {dayjs(cell.getValue()).format("DD MMM, HH:mm:ss")}
          </Typography>
        ),
      },
      {
        accessorKey: "deliveryActions",
        header: "Retry",
        size: 80,
        enableSorting: false,
        Cell: ({ cell }: any) => {
          const row = cell.row.original;
          if (row.status === "success") return null;
          return (
            <Tooltip title="Retry delivery">
              <IconButton
                size="small"
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "6px",
                  color: "#6366f1",
                  backgroundColor: "rgba(99,102,241,0.12)",
                  "&:hover": { backgroundColor: "rgba(99,102,241,0.2)" },
                }}
                onClick={() => handleRetry(row.id)}
              >
                <ReplayIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          );
        },
      },
    ],
    [handleRetry],
  );

  const memoizedData = useMemo(() => data || [], [data]);
  const tableConfig = useTableConfig(memoizedData, columns, loading, {
    enableServerSidePagination: true,
    totalRowCount: totalCount,
    onPaginationChange: handlePaginationChange,
    onPageSizeChange: handlePageSizeChange,
    initialPagination: pagination,
    pageSizeOptions: [10, 20, 50, 100],
  });

  const table = useMaterialReactTable({
    ...tableConfig.table,
    state: { ...tableConfig.table.state, isLoading: loading },
    renderTopToolbarCustomActions: () =>
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
      ),
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />
    </ErrorBoundary>
  );
}

export default memo(WebhookDeliveries);
