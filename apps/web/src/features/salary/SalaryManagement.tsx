import {
  memo,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router-dom";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Person from "@mui/icons-material/Person";
import { API_ENDPOINTS } from "@web/shared/constants";

function EmployeeManagement() {
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

  const columns = useMemo(
    () => [
      {
        key: "first_name",
        label: "Name",
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
    ],
    [],
  );

  return (
    <Box sx={{ p: 2 }}>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <DataList
          ariaLabel="Employee salaries"
          data={memoizedData || []}
          columns={columns}
          loading={loading}
          emptyMessage="No employees found"
          onRowClick={(row: any) =>
            navigate(`/payroll/salary-management/${row.id}`)
          }
          search={{
            value: globalFilter,
            onChange: handleGlobalFilterChange,
            placeholder: "Search employees…",
          }}
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
    </Box>
  );
}

export default memo(EmployeeManagement);
