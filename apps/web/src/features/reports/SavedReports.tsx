import { memo, useCallback, useContext, useMemo, useState } from "react";
import dayjs from "dayjs";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import Chip from "@mui/material/Chip";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import { API_ENDPOINTS } from "@web/shared/constants";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";

function SavedReports() {
  const { setAlert } = useContext(AlertContext);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
  } | null>(null);

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
      setDeletingId(reportId);
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
      } finally {
        setDeletingId(null);
        setConfirmTarget(null);
      }
    },
    [refresh, setAlert],
  );

  const columns = useMemo(
    () => [
      { key: "name", label: "Report Name", primary: true, hideLabel: true },
      {
        key: "entity",
        label: "Entity",
        hideLabel: true,
        render: (row: any) => (
          <Chip
            label={row.entity}
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
        key: "description",
        label: "Description",
        render: (row: any) => row.description ?? "—",
      },
      {
        key: "lastRunAt",
        label: "Last Run",
        render: (row: any) =>
          row.lastRunAt ? dayjs(row.lastRunAt).format("DD MMM YYYY") : "Never",
      },
      {
        key: "createdAt",
        label: "Created",
        render: (row: any) => dayjs(row.createdAt).format("DD MMM YYYY"),
      },
    ],
    [],
  );

  const rowActions = useCallback(
    (row: any) => [
      {
        icon: <PlayArrowIcon sx={{ fontSize: 16 }} />,
        label: "Run report",
        color: "success" as const,
        onClick: () => handleRun(row.id, row.name),
      },
      {
        icon: <DownloadIcon sx={{ fontSize: 16 }} />,
        label: "Download CSV",
        color: "primary" as const,
        onClick: () => handleDownload(row.id, row.name),
      },
      {
        icon: <DeleteIcon sx={{ fontSize: 16 }} />,
        label: "Delete report",
        color: "error" as const,
        onClick: () => setConfirmTarget({ id: row.id }),
      },
    ],
    [handleRun, handleDownload],
  );

  const memoizedData = useMemo(() => data || [], [data]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Saved reports"
        data={memoizedData}
        columns={columns}
        actions={rowActions}
        loading={loading}
        emptyMessage="No saved reports found"
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [5, 10, 25, 50],
        }}
      />

      <ConfirmationDialog
        open={!!confirmTarget}
        onClose={() => {
          if (!deletingId) setConfirmTarget(null);
        }}
        onConfirm={() => {
          if (confirmTarget) handleDelete(confirmTarget.id);
        }}
        title="Delete Saved Report"
        message="Delete this saved report?"
        confirmText="Delete"
        loading={!!deletingId}
        variant="danger"
      />
    </ErrorBoundary>
  );
}

export default memo(SavedReports);
