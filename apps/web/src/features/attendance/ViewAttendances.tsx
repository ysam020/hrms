import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Download from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import DataList from "@web/shared/components/DataList";
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
import Person from "@mui/icons-material/Person";
import { API_ENDPOINTS } from "@web/shared/constants";
import formatEmployeeLabel from "@web/shared/utils/formatEmployeeLabel";

function ViewAttendances() {
  // Use date format YYYY-MM
  const [date, setDate] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(
      2,
      "0",
    )}`,
  );
  const [isDownloading, setIsDownloading] = useState(false);
  const [globalFilter, setGlobalFilter] = useState("");
  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setAlert } = useContext(AlertContext);

  // API function for fetching attendance data with pagination
  const fetchAttendanceData = useCallback(
    async ({ page, limit }) => {
      try {
        const [year, month] = date.split("-");
        const search = searchRef.current;
        const baseUrl = API_ENDPOINTS.GET_ALL_ATTENDANCES(
          Number(year),
          Number(month),
          page,
          limit,
        );
        const url = search
          ? `${baseUrl}&search=${encodeURIComponent(search)}`
          : baseUrl;

        const response = await apiClient(url);

        return {
          data: response.data.data.records,
          totalCount: response.data.data.pagination?.totalCount,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
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
    resetPagination,
  } = useServerPagination(fetchAttendanceData, {
    initialPageSize: 10,
    deps: [date],
  });

  const handleGlobalFilterChange = useCallback(
    (value) => {
      searchRef.current = value ?? "";
      setGlobalFilter(value ?? "");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        resetPagination();
      }, 400);
    },
    [resetPagination],
  );

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

  const columns = useMemo(
    () => [
      {
        key: "username",
        label: "Username",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person
              sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
            />
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {formatEmployeeLabel(
                `${row.firstName ?? ""} ${row.lastName ?? ""}`,
                row.username,
              )}
            </Typography>
          </Box>
        ),
      },
      { key: "presents", label: "Presents" },
      { key: "halfDays", label: "Half Days" },
      { key: "totalLeaves", label: "Total Leaves" },
      { key: "paidLeaves", label: "Paid Leaves" },
      { key: "unpaidLeaves", label: "Unpaid Leaves" },
      { key: "correctionsUsed", label: "Corrections" },
    ],
    [],
  );

  const dateToolbar = tableToolbarDate(date, setDate);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="Attendance summary"
        data={data || []}
        columns={columns}
        loading={loading}
        emptyMessage="No attendance records found"
        search={{
          value: globalFilter,
          onChange: handleGlobalFilterChange,
          placeholder: "Search employees…",
        }}
        toolbarActions={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            {dateToolbar.renderTopToolbarCustomActions &&
              dateToolbar.renderTopToolbarCustomActions()}
            <Tooltip title="Refresh">
              <IconButton
                onClick={refresh}
                disabled={loading}
                color="primary"
                size="small"
                aria-label="Refresh attendance data"
              >
                <RefreshIcon aria-hidden="true" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Download Excel">
              <IconButton
                onClick={handleDownloadExcel}
                disabled={
                  !data || data.length === 0 || loading || isDownloading
                }
                color="primary"
                size="small"
                aria-label="Download attendance as Excel"
              >
                <Download aria-hidden="true" />
              </IconButton>
            </Tooltip>
          </Box>
        }
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [5, 10, 25, 50, 100],
        }}
      />
    </ErrorBoundary>
  );
}

export default memo(ViewAttendances);
