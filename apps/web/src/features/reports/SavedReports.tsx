import { memo, useCallback, useContext, useMemo } from "react";
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
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import { API_ENDPOINTS } from "@web/shared/constants";

function SavedReports() {
  const { setAlert } = useContext(AlertContext);

  const fetchReports = useCallback(
    async ({ page, limit }) => {
      try {
        const res = await apiClient(API_ENDPOINTS.SAVED_REPORTS(page, limit));
        return {
          data: res.data.data || [],
          totalCount: res.data.data?.length || 0,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch saved reports",
          severity: "error",
        });
        throw err;
      }
    },
    [setAlert],
  );

  const {
    data,
    loading,
    totalCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
    refresh,
  } = useServerPagination(fetchReports, { initialPageSize: 10 });

  const handleRun = useCallback(
    async (reportId: string, reportName: string) => {
      try {
        const res = await apiClient.post(
          API_ENDPOINTS.RUN_SAVED_REPORT(reportId),
        );
        const rows = res.data.data?.rows ?? [];
        setAlert({
          open: true,
          message: `${reportName}: ${rows.length} row(s) returned`,
          severity: "success",
        });
      } catch (err) {
        setAlert({
          open: true,
          message: err?.response?.data?.message || "Report run failed",
          severity: "error",
        });
      }
    },
    [setAlert],
  );

  const handleDownload = useCallback(
    async (reportId: string, reportName: string) => {
      try {
        const res = await apiClient.post(
          `${API_ENDPOINTS.RUN_SAVED_REPORT(reportId)}?format=csv`,
          {},
          { responseType: "blob" },
        );
        const url = URL.createObjectURL(res.data);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${reportName.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        setAlert({
          open: true,
          message: "CSV download failed",
          severity: "error",
        });
      }
    },
    [setAlert],
  );

  const handleDelete = useCallback(
    async (reportId: string) => {
      if (!confirm("Delete this saved report?")) return;
      try {
        await apiClient.delete(API_ENDPOINTS.DELETE_SAVED_REPORT(reportId));
        refresh();
        setAlert({
          open: true,
          message: "Report deleted",
          severity: "success",
        });
      } catch {
        setAlert({ open: true, message: "Delete failed", severity: "error" });
      }
    },
    [refresh, setAlert],
  );

  const iconBtn = (color: string, bg: string) => ({
    width: 28,
    height: 28,
    borderRadius: "6px",
    color,
    backgroundColor: bg,
    "&:hover": { backgroundColor: bg.replace("0.12", "0.22") },
  });

  const columns = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Report Name",
        size: 200,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem" fontWeight={600}>
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "entity",
        header: "Entity",
        size: 120,
        Cell: ({ cell }: any) => (
          <Chip
            label={cell.getValue()}
            size="small"
            sx={{
              backgroundColor: "rgba(99,102,241,0.12)",
              color: "#6366f1",
              fontWeight: 600,
              fontSize: "0.7rem",
              height: 22,
              borderRadius: "4px",
            }}
          />
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        size: 220,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem" color="text.secondary">
            {cell.getValue() ?? "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "lastRunAt",
        header: "Last Run",
        size: 140,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()
              ? dayjs(cell.getValue()).format("DD MMM YYYY")
              : "Never"}
          </Typography>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {dayjs(cell.getValue()).format("DD MMM YYYY")}
          </Typography>
        ),
      },
      {
        accessorKey: "savedReportActions",
        header: "Actions",
        size: 120,
        enableSorting: false,
        Cell: ({ cell }: any) => {
          const row = cell.row.original;
          return (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Tooltip title="Run report">
                <IconButton
                  size="small"
                  sx={iconBtn("#059669", "rgba(5,150,105,0.12)")}
                  onClick={() => handleRun(row.id, row.name)}
                >
                  <PlayArrowIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Download CSV">
                <IconButton
                  size="small"
                  sx={iconBtn("#6366f1", "rgba(99,102,241,0.12)")}
                  onClick={() => handleDownload(row.id, row.name)}
                >
                  <DownloadIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete report">
                <IconButton
                  size="small"
                  sx={iconBtn("#dc2626", "rgba(220,38,38,0.12)")}
                  onClick={() => handleDelete(row.id)}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    [handleRun, handleDownload, handleDelete],
  );

  const memoizedData = useMemo(() => data || [], [data]);
  const tableConfig = useTableConfig(memoizedData, columns, loading, {
    enableServerSidePagination: true,
    totalRowCount: totalCount,
    onPaginationChange: handlePaginationChange,
    onPageSizeChange: handlePageSizeChange,
    initialPagination: pagination,
    pageSizeOptions: [5, 10, 25, 50],
  });

  const table = useMaterialReactTable({
    ...tableConfig.table,
    state: { ...tableConfig.table.state, isLoading: loading },
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />
    </ErrorBoundary>
  );
}

export default memo(SavedReports);
