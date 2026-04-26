import React, {
  useCallback,
  useMemo,
  useContext,
  useRef,
  useState,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import { useNavigate } from "react-router-dom";
import useTableConfig from "@web/shared/hooks/useTableConfig";
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
import { API_ENDPOINTS } from "@web/shared/constants";

function ViewKycList() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();

  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");

  const fetchKycData = useCallback(
    async ({ page, limit }) => {
      try {
        const search = searchRef.current;
        const baseUrl = API_ENDPOINTS.VIEW_ALL_KYCS(page, limit);
        const url = search
          ? `${baseUrl}&search=${encodeURIComponent(search)}`
          : baseUrl;
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
    [setAlert],
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

  // Memoize Columns
  const columns = useMemo(
    () => [
      {
        accessorKey: "first_name",
        header: "First Name",
        size: 170,
        Cell: ({ cell }) => (
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Person
              sx={{ fontSize: 14, color: "text.secondary", opacity: 0.6 }}
            />
            <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
              {cell.getValue()}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "middle_name",
        header: "Middle Name",
        size: 170,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() || "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "last_name",
        header: "Last Name",
        size: 170,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "department",
        header: "Department",
        size: 220,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "designation",
        header: "Designation",
        size: 220,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "employeeStatus",
        header: "Status",
        size: 120,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue()}
          </Typography>
        ),
      },
      {
        accessorKey: "kyc_approval",
        header: "KYC Approval",
        size: 130,
        Cell: ({ cell }) => getKycApprovalChip(cell.getValue()),
      },
    ],

    [theme],
  );

  // Configure table with server-side pagination
  const tableConfig = useTableConfig(memoizedData, columns, loading, {
    enableServerSidePagination: true,
    totalRowCount: totalCount,
    onPaginationChange: handlePaginationChange,
    onPageSizeChange: handlePageSizeChange,
    initialPagination: pagination,
    pageSizeOptions: [5, 10, 25, 50, 100],
  });

  const table = useMaterialReactTable(
    useMemo(
      () => ({
        ...tableConfig.table,
        manualFiltering: true,
        state: {
          ...tableConfig.table.state,
          globalFilter,
        },
        onGlobalFilterChange: handleGlobalFilterChange,
        muiTableBodyRowProps: ({ row }) => ({
          onClick: () => navigate(`/view-kyc/${row.original.username}`),
          style: { cursor: "pointer" },
        }),
      }),
      [tableConfig.table, navigate, globalFilter, handleGlobalFilterChange],
    ),
  );

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <MaterialReactTable table={table} />
      </ErrorBoundary>
    </div>
  );
}

export default React.memo(ViewKycList);
