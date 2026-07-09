import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import { Dropdown } from "primereact/dropdown";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Person from "@mui/icons-material/Person";
import FilterList from "@mui/icons-material/FilterList";
import { API_ENDPOINTS } from "@web/shared/constants";

const STATUS_OPTIONS = [
  { label: "All", value: "All" },
  { label: "Pending", value: "Pending" },
  { label: "Approved", value: "Approved" },
  { label: "Rejected", value: "Rejected" },
];

function ViewKycList() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();

  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const fetchKycData = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        let params = search ? `&search=${encodeURIComponent(search)}` : "";
        if (statusFilter && statusFilter !== "All") {
          params += `&status=${statusFilter}`;
        }
        const url = API_ENDPOINTS.VIEW_ALL_KYCS(page, limit, params);
        const response = await apiClient(url);

        return {
          data: response.data.data?.kycs,
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
    [statusFilter, setAlert],
  );

  const {
    data,
    loading,
    totalCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
    resetPagination,
  } = useServerPagination(fetchKycData, {
    initialPageSize: 10,
    deps: [statusFilter],
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

  // Memoized Data to Prevent Unnecessary Re-renders
  const memoizedData = useMemo(() => data, [data]);

  // Get KYC approval chip
  const getKycApprovalChip = (status) => {
    const statusMap = {
      approved: {
        color: theme === "light" ? "#059669" : "#34d399",
        bg:
          theme === "light"
            ? "rgba(16, 185, 129, 0.15)"
            : "rgba(52, 211, 153, 0.2)",
        label: "Approved",
      },
      rejected: {
        color: theme === "light" ? "#dc2626" : "#f87171",
        bg:
          theme === "light"
            ? "rgba(239, 68, 68, 0.15)"
            : "rgba(248, 113, 113, 0.2)",
        label: "Rejected",
      },
      pending: {
        color: theme === "light" ? "#d97706" : "#fbbf24",
        bg:
          theme === "light"
            ? "rgba(251, 191, 36, 0.15)"
            : "rgba(251, 191, 36, 0.2)",
        label: "Pending",
      },
    };

    const config =
      statusMap[typeof status === "string" ? status.toLowerCase() : ""] ||
      statusMap.pending;

    return (
      <Chip
        label={config.label}
        size="small"
        sx={{
          backgroundColor: config.bg,
          color: config.color,
          fontWeight: 500,
          fontSize: "0.7rem",
          height: "22px",
          borderRadius: "4px",
          "& .MuiChip-label": {
            padding: "0 8px",
          },
        }}
      />
    );
  };

  const columns = useMemo(
    () => [
      {
        key: "first_name",
        label: "First Name",
        primary: true,
        hideLabel: true,
        render: (row: any) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person
              sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
            />
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {row.first_name} {row.middle_name || ""} {row.last_name}
            </Typography>
          </Box>
        ),
      },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      { key: "employeeStatus", label: "Status" },
      {
        key: "kyc_approval",
        label: "KYC Approval",
        hideLabel: true,
        render: (row: any) => getKycApprovalChip(row.kyc_approval),
      },
    ],
    [theme],
  );

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <DataList
          ariaLabel="Employee KYC records"
          data={memoizedData || []}
          columns={columns}
          loading={loading}
          emptyMessage="No KYC records found"
          onRowClick={(row: any) => navigate(`/view-kyc/${row.username}`)}
          search={{
            value: globalFilter,
            onChange: handleGlobalFilterChange,
            placeholder: "Search employees…",
          }}
          toolbarActions={
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <FilterList
                sx={{ fontSize: 18, color: "text.secondary", opacity: 0.7 }}
              />
              <Box sx={{ minWidth: 130 }}>
                <Dropdown
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.value)}
                  options={STATUS_OPTIONS}
                  placeholder="Select Status"
                  className="w-full"
                  style={{ minWidth: "130px" }}
                  appendTo={() =>
                    document.querySelector("#root .App") as HTMLElement
                  }
                />
              </Box>
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
    </div>
  );
}

export default memo(ViewKycList);
