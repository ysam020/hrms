import { memo, useCallback, useContext, useMemo } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "@web/shared/hooks/useTableConfig";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DownloadIcon from "@mui/icons-material/Download";
import { API_ENDPOINTS } from "@web/shared/constants";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function MyPayslips() {
  const { setAlert } = useContext(AlertContext);

  const fetchPayslips = useCallback(
    async ({ page, limit }) => {
      try {
        const res = await apiClient(API_ENDPOINTS.MY_PAYSLIPS(page, limit));
        return {
          data: res.data.data?.payslips || res.data.data || [],
          totalCount: res.data.data?.total || 0,
        };
      } catch (err) {
        if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError")
          throw err;
        setAlert({
          open: true,
          message: "Failed to fetch payslips",
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
  } = useServerPagination(fetchPayslips, { initialPageSize: 12 });

  const columns = useMemo(
    () => [
      {
        accessorKey: "month",
        header: "Period",
        size: 140,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem" fontWeight={500}>
            {MONTHS[(cell.row.original.month ?? 1) - 1]}{" "}
            {cell.row.original.year}
          </Typography>
        ),
      },
      {
        accessorKey: "grossSalary",
        header: "Gross",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() != null
              ? `₹${Number(cell.getValue()).toLocaleString("en-IN")}`
              : "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "basicPay",
        header: "Basic Pay",
        size: 120,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() != null
              ? `₹${Number(cell.getValue()).toLocaleString("en-IN")}`
              : "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "netPayable",
        header: "Net Payable",
        size: 130,
        Cell: ({ cell }: any) => (
          <Typography
            variant="body2"
            fontSize="0.8rem"
            fontWeight={600}
            color="success.main"
          >
            {cell.getValue() != null
              ? `₹${Number(cell.getValue()).toLocaleString("en-IN")}`
              : "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "pf",
        header: "PF",
        size: 100,
        Cell: ({ cell }: any) => (
          <Typography variant="body2" fontSize="0.8rem">
            {cell.getValue() != null
              ? `₹${Number(cell.getValue()).toLocaleString("en-IN")}`
              : "—"}
          </Typography>
        ),
      },
      {
        accessorKey: "download",
        header: "Download",
        size: 100,
        enableSorting: false,
        Cell: ({ cell }: any) => {
          const row = cell.row.original;
          return (
            <Box>
              <Tooltip title="Download PDF">
                <IconButton
                  size="small"
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "6px",
                    color: "#6366f1",
                    backgroundColor: "rgba(99,102,241,0.12)",
                    "&:hover": { backgroundColor: "rgba(99,102,241,0.2)" },
                  }}
                  onClick={async () => {
                    try {
                      const res = await apiClient(
                        `/generate-salary-slip/${row.userId}/${row.year}/${row.month}`,
                        { responseType: "blob" },
                      );
                      const url = URL.createObjectURL(res.data);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `payslip_${MONTHS[(row.month ?? 1) - 1]}_${row.year}.pdf`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      setAlert({
                        open: true,
                        message: "Failed to download payslip",
                        severity: "error",
                      });
                    }
                  }}
                >
                  <DownloadIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          );
        },
      },
    ],
    [setAlert],
  );

  const memoizedData = useMemo(() => data || [], [data]);
  const tableConfig = useTableConfig(memoizedData, columns, loading, {
    enableServerSidePagination: true,
    totalRowCount: totalCount,
    onPaginationChange: handlePaginationChange,
    onPageSizeChange: handlePageSizeChange,
    initialPagination: pagination,
    pageSizeOptions: [12, 24, 60],
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

export default memo(MyPayslips);
