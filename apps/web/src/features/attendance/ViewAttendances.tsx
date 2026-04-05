import React, { useState, useMemo, useContext, useCallback } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Download from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import { tableToolbarDate } from "@web/shared/utils/table/tableToolbarDate";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { AlertContext } from "@web/app/providers/AlertContext";
import {
  downloadExcel,
  generateFilename,
} from "@web/shared/utils/downloadReport";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid2";
import Divider from "@mui/material/Divider";
import Person from "@mui/icons-material/Person";
import EventAvailable from "@mui/icons-material/EventAvailable";
import Schedule from "@mui/icons-material/Schedule";
import BeachAccess from "@mui/icons-material/BeachAccess";
import MonetizationOn from "@mui/icons-material/MonetizationOn";
import MoneyOff from "@mui/icons-material/MoneyOff";
import EditNote from "@mui/icons-material/EditNote";
import { API_ENDPOINTS } from "@web/shared/constants";
import CircularProgress from "@mui/material/CircularProgress";

// Mobile Card Component
const AttendanceCard = React.memo(({ employee }: { employee: any }) => (
  <Card sx={{ mb: 2, boxShadow: 2 }}>
    <CardContent>
      <Grid container>
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <Person sx={{ color: "primary.main" }} />
            <Typography variant="h6" fontWeight={600}>
              {employee.username}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      <Grid container>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center" }}>
            <EventAvailable sx={{ fontSize: 18, color: "success.main" }} />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Present
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {employee.presents}
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Schedule sx={{ fontSize: 18, color: "warning.main" }} />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Half Days
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {employee.halfDays}
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <MonetizationOn sx={{ fontSize: 18, color: "info.main" }} />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Paid Leaves
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {employee.paidLeaves}
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid size={{ xs: 6, sm: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <MoneyOff sx={{ fontSize: 18, color: "error.main" }} />
            <Box>
              <Typography variant="caption" color="text.secondary">
                Unpaid Leaves
              </Typography>
              <Typography variant="h6" fontWeight={600}>
                {employee.unpaidLeaves}
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>

      <Grid container>
        <Grid size={{ xs: 12 }}>
          <Divider sx={{ my: 1 }} />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <BeachAccess sx={{ fontSize: 18 }} />
              <Typography variant="body2" color="text.secondary">
                Total Leaves: {employee.totalLeaves}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <EditNote sx={{ fontSize: 18 }} />
              <Typography variant="body2" color="text.secondary">
                Corrections: {employee.correctionsUsed}
              </Typography>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </CardContent>
  </Card>
));

function ViewAttendances() {
  // Use date format YYYY-MM
  const [date, setDate] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(
      2,
      "0",
    )}`,
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const { setAlert } = useContext(AlertContext);

  // API function for fetching attendance data with pagination
  const fetchAttendanceData = useCallback(
    async ({ page, limit }) => {
      try {
        // Parse year and month from date
        const [year, month] = date.split("-");

        const response = await apiClient(
          API_ENDPOINTS.GET_ALL_ATTENDANCES(
            Number(year),
            Number(month),
            page,
            limit,
          ),
        );

        return {
          data: response.data.data.records,
          totalCount: response.data.data.pagination?.totalCount,
        };
      } catch (err) {
        setAlert({
          open: true,
          message:
            err.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : err.response?.data?.message || "Something went wrong",
          severity: "error",
        });
        throw err;
      }
    },
    [date, setAlert],
  );

  // Use server pagination hook
  const {
    data,
    loading,
    totalCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
    refresh,
  } = useServerPagination(fetchAttendanceData, {
    initialPageSize: 10,
    deps: [date], // Refetch when date changes
  });

  // Download function
  const handleDownloadExcel = useCallback(async () => {
    if (isDownloading) return;

    try {
      setIsDownloading(true);
      // Parse year and month from date
      const [year, month] = date.split("-");

      // Fetch all data without pagination for download
      const response = await apiClient(`/get-all-attendances/${year}/${month}`);
      const allData = response.data.summaries || response.data.data || [];

      const filename = generateFilename("Attendances", `${year}-${month}`);
      await downloadExcel(allData, filename);

      setAlert({
        open: true,
        message: "Download completed successfully",
        severity: "success",
      });
    } catch (err) {
      setAlert({
        open: true,
        message:
          "Download failed: " + (err.response?.data?.message || err.message),
        severity: "error",
      });
    } finally {
      setIsDownloading(false);
    }
  }, [date, setAlert, isDownloading]);

  // Memoize data
  const memoizedData = useMemo(() => data, [data]);

  // Desktop table columns
  const columns = useMemo(
    () => [
      {
        accessorKey: "username",
        header: "Username",
        size: 200,
        Cell: ({ cell }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person sx={{ fontSize: 16, color: "primary.main" }} />
            <Typography variant="body2" fontWeight={500}>
              {cell.getValue()}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "presents",
        header: "Presents",
        size: 150,
      },
      {
        accessorKey: "halfDays",
        header: "Half Days",
        size: 150,
      },
      {
        accessorKey: "totalLeaves",
        header: "Total Leaves",
        size: 180,
      },
      {
        accessorKey: "paidLeaves",
        header: "Paid Leaves",
        size: 180,
      },
      {
        accessorKey: "unpaidLeaves",
        header: "Unpaid Leaves",
        size: 180,
      },
      {
        accessorKey: "correctionsUsed",
        header: "Corrections",
        size: 180,
      },
    ],
    [],
  );

  // Configure table with server-side pagination
  const { table: tableConfig } = useTableConfig(
    memoizedData,
    columns,
    loading,
    {
      enableServerSidePagination: true,
      totalRowCount: totalCount,
      onPaginationChange: handlePaginationChange,
      onPageSizeChange: handlePageSizeChange,
      initialPagination: pagination,
      pageSizeOptions: [5, 10, 25, 50, 100],
    },
  );

  const dateToolbar = tableToolbarDate(date, setDate);

  const table = useMaterialReactTable({
    ...tableConfig,
    renderTopToolbarCustomActions: () => (
      <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
        {dateToolbar.renderTopToolbarCustomActions &&
          dateToolbar.renderTopToolbarCustomActions()}

        <Tooltip title="Refresh">
          <IconButton
            onClick={refresh}
            disabled={loading}
            color="primary"
            size="small"
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>

        <Tooltip title="Download Excel">
          <IconButton
            onClick={handleDownloadExcel}
            disabled={!data || data.length === 0 || loading || isDownloading}
            color="primary"
            size="small"
          >
            <Download />
          </IconButton>
        </Tooltip>
      </Box>
    ),
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Box>
        {/* Desktop View */}
        <Box sx={{ display: { xs: "none", md: "block" } }}>
          <MaterialReactTable table={table} />
        </Box>

        {/* Mobile View */}
        <Box sx={{ display: { xs: "block", md: "none" } }}>
          <Box
            sx={{
              mb: 2,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Typography variant="h6" fontWeight={600}>
              Attendance Summary
            </Typography>
            <Box sx={{ display: "flex", gap: 1 }}>
              {dateToolbar.renderTopToolbarCustomActions &&
                dateToolbar.renderTopToolbarCustomActions()}
              <IconButton onClick={refresh} disabled={loading}>
                <RefreshIcon />
              </IconButton>
              <IconButton
                onClick={handleDownloadExcel}
                disabled={loading || isDownloading}
              >
                <Download />
              </IconButton>
            </Box>
          </Box>

          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                p: 4,
              }}
            >
              <CircularProgress size={32} />
            </Box>
          ) : (
            <>
              {data.map((employee, index) => (
                <AttendanceCard
                  key={`${employee.username}-${index}`}
                  employee={employee}
                />
              ))}

              {/* Mobile Pagination Info */}
              <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Page {pagination.pageIndex + 1} of{" "}
                  {Math.ceil(totalCount / pagination.pageSize)} ({totalCount}{" "}
                  total records)
                </Typography>
              </Box>
            </>
          )}
        </Box>
      </Box>
    </ErrorBoundary>
  );
}

export default React.memo(ViewAttendances);
