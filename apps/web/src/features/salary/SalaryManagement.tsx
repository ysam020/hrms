import React, { useCallback, useMemo, useContext } from "react";
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
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Person from "@mui/icons-material/Person";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { API_ENDPOINTS } from "@web/shared/constants";

function EmployeeManagement() {
  const { setAlert } = useContext(AlertContext);
  const { theme } = useContext(ThemeContext);
  const navigate = useNavigate();

  const fetchEmployeeData = useCallback(
    async ({ page, limit }) => {
      try {
        const response = await apiClient(
          API_ENDPOINTS.VIEW_ALL_KYCS(page, limit),
        );

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
  } = useServerPagination(fetchEmployeeData, {
    initialPageSize: 10,
  });

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
      {
        accessorKey: "actions",
        header: "Actions",
        size: 100,
        Cell: ({ cell }) => {
          return (
            <Tooltip title="View Details">
              <IconButton
                size="small"
                onClick={() =>
                  navigate(`/salary-management/${cell.row.original.id}`)
                }
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "6px",
                  color: theme === "light" ? "#6366f1" : "#818cf8",
                  backgroundColor:
                    theme === "light"
                      ? "rgba(99, 102, 241, 0.12)"
                      : "rgba(129, 140, 248, 0.15)",
                  "&:hover": {
                    backgroundColor:
                      theme === "light"
                        ? "rgba(99, 102, 241, 0.2)"
                        : "rgba(129, 140, 248, 0.25)",
                  },
                }}
              >
                <VisibilityIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          );
        },
      },
    ],
    [navigate, theme],
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
        muiTableContainerProps: {
          sx: { maxHeight: "650px", overflowY: "auto" },
        },
      }),
      [tableConfig.table],
    ),
  );

  return (
    <Box sx={{ p: 2 }}>
      <ErrorBoundary fallback={<ErrorFallback />}>
        {loading ? (
          <p>Loading Employee List...</p>
        ) : (
          <MaterialReactTable table={table} />
        )}
      </ErrorBoundary>
    </Box>
  );
}

export default React.memo(EmployeeManagement);
