import { memo, useCallback, useContext, useMemo } from "react";
import Box from "@mui/material/Box";
import DataList from "@web/shared/components/DataList";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
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

  const money = (v: number | null | undefined) =>
    v != null ? `₹${Number(v).toLocaleString("en-IN")}` : "—";

  const columns = useMemo(
    () => [
      {
        key: "month",
        label: "Period",
        primary: true,
        hideLabel: true,
        render: (row: any) => `${MONTHS[(row.month ?? 1) - 1]} ${row.year}`,
      },
      {
        key: "grossSalary",
        label: "Gross",
        render: (row: any) => money(row.grossSalary),
      },
      {
        key: "basicPay",
        label: "Basic Pay",
        render: (row: any) => money(row.basicPay),
      },
      {
        key: "netPayable",
        label: "Net Payable",
        render: (row: any) => (
          <Box component="span" sx={{ color: "success.main", fontWeight: 600 }}>
            {money(row.netPayable)}
          </Box>
        ),
      },
      { key: "pf", label: "PF", render: (row: any) => money(row.pf) },
    ],
    [],
  );

  const actions = useCallback(
    (row: any) => [
      {
        icon: <DownloadIcon sx={{ fontSize: 16 }} />,
        label: "Download PDF",
        color: "primary" as const,
        onClick: async () => {
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
        },
      },
    ],
    [setAlert],
  );

  const memoizedData = useMemo(() => data || [], [data]);

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <DataList
        ariaLabel="My payslips"
        data={memoizedData}
        columns={columns}
        actions={actions}
        loading={loading}
        emptyMessage="No payslips found"
        pagination={{
          page: pagination.pageIndex,
          pageSize: pagination.pageSize,
          totalCount,
          onPageChange: (page) =>
            handlePaginationChange({ ...pagination, pageIndex: page }),
          onPageSizeChange: handlePageSizeChange,
          pageSizeOptions: [12, 24, 60],
        }}
      />
    </ErrorBoundary>
  );
}

export default memo(MyPayslips);
