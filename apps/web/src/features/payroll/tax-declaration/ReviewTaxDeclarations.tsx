import { memo, useCallback, useContext, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { useNavigate } from "react-router-dom";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";

function currentFinancialYear(): string {
  const now = new Date();
  const startYear =
    now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

const STATUS_COLORS: Record<
  string,
  "default" | "warning" | "success" | "info"
> = {
  Submitted: "info",
  RevisionRequested: "warning",
  Declared: "success",
  ProofsSubmitted: "info",
  ProofRevisionRequested: "warning",
  Verified: "success",
};

function ReviewTaxDeclarations() {
  const navigate = useNavigate();
  const { setAlert } = useContext(AlertContext);
  const financialYear = useMemo(() => currentFinancialYear(), []);
  const [status, setStatus] = useState("All");

  const fetchDeclarations = useCallback(
    async ({ page, limit }) => {
      try {
        const params = status !== "All" ? `&status=${status}` : "";
        const res = await apiClient.get(
          API_ENDPOINTS.LIST_DECLARATIONS(financialYear, page, limit, params),
        );
        return {
          data: res.data?.data ?? [],
          totalCount: res.data?.pagination?.total ?? 0,
        };
      } catch (err: any) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message:
            err?.response?.data?.message ?? "Failed to load tax declarations.",
          severity: "error",
        });
        throw err;
      }
    },
    [financialYear, status, setAlert],
  );

  const {
    data,
    loading,
    totalCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
  } = useServerPagination(fetchDeclarations, { deps: [financialYear, status] });

  const columns = useMemo(
    () => [
      {
        key: "employee",
        label: "Employee",
        render: (row: any) =>
          [row.employee?.first_name, row.employee?.last_name]
            .filter(Boolean)
            .join(" ") || row.employee?.username,
      },
      { key: "financialYear", label: "FY" },
      {
        key: "status",
        label: "Status",
        render: (row: any) => (
          <Chip
            size="small"
            label={row.status}
            color={STATUS_COLORS[row.status] ?? "default"}
            variant="outlined"
          />
        ),
      },
      {
        key: "updatedAt",
        label: "Last updated",
        render: (row: any) =>
          row.updatedAt ? new Date(row.updatedAt).toLocaleDateString() : "—",
      },
    ],
    [],
  );

  const actions = useCallback(
    (row: any) => [
      {
        icon: <VisibilityIcon sx={{ fontSize: 16 }} />,
        label: "Review",
        color: "primary" as const,
        onClick: () =>
          navigate(
            `/payroll/tax-declarations/${row.userId}?financialYear=${row.financialYear}`,
          ),
      },
    ],
    [navigate],
  );

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Status</InputLabel>
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <MenuItem value="All">All</MenuItem>
            <MenuItem value="Submitted">Submitted</MenuItem>
            <MenuItem value="RevisionRequested">Revision Requested</MenuItem>
            <MenuItem value="Declared">Declared</MenuItem>
            <MenuItem value="ProofsSubmitted">Proofs Submitted</MenuItem>
            <MenuItem value="ProofRevisionRequested">
              Proof Revision Requested
            </MenuItem>
            <MenuItem value="Verified">Verified</MenuItem>
          </Select>
        </FormControl>
      </Box>
      <DataList
        ariaLabel="Tax declarations"
        data={data || []}
        columns={columns}
        actions={actions}
        loading={loading}
        emptyMessage={`No tax declarations for FY ${financialYear}`}
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [10, 25, 50],
        }}
      />
    </ErrorBoundary>
  );
}

export default memo(ReviewTaxDeclarations);
