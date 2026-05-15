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
import { getTableColumns } from "@web/shared/utils/table/getTableColumns";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Person from "@mui/icons-material/Person";
import { API_ENDPOINTS } from "@web/shared/constants";

function EmployeeList() {
  const { setAlert } = useContext(AlertContext);
  const navigate = useNavigate();

  const searchRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [globalFilter, setGlobalFilter] = useState("");

  const fetchEmployeeData = useCallback(
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
  } = useServerPagination(fetchEmployeeData, {
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

  const memoizedData = useMemo(() => data, [data]);

  const baseColumns = useMemo(
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
    ],
    [],
  );

  const columns = useMemo(() => getTableColumns(baseColumns), [baseColumns]);

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
        muiTableContainerProps: {
          sx: { maxHeight: "580px", overflowY: "auto" },
        },
        muiTableBodyRowProps: ({ row }) => ({
          onClick: () =>
            navigate(`/employee-management/${row.original.username}`),
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

export default React.memo(EmployeeList);
