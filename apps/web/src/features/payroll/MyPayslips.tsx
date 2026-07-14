import { memo, useCallback, useContext, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import DataList from "@web/shared/components/DataList";
import Button from "@web/shared/components/Button";
import useServerPagination from "@web/shared/hooks/useServerPagination";
import apiClient from "@web/core/http/axiosConfig";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "@web/app/providers/AlertContext";
import DownloadIcon from "@mui/icons-material/Download";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import DescriptionIcon from "@mui/icons-material/Description";
import { API_ENDPOINTS } from "@web/shared/constants";

function currentFinancialYear(): string {
  const now = new Date();
  const startYear =
    now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

function financialYearOptions(): string[] {
  const current = currentFinancialYear();
  const currentStart = parseInt(current.split("-")[0], 10);
  return [0, 1, 2].map(
    (back) =>
      `${currentStart - back}-${String((currentStart - back + 1) % 100).padStart(2, "0")}`,
  );
}

// responseType:"blob" means an error response body also arrives as a Blob,
// not parsed JSON — read it back as text to surface the server's actual
// message (e.g. "Complete KYC first") instead of a generic failure string.
async function extractBlobErrorMessage(
  err: any,
  fallback: string,
): Promise<string> {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text());
      if (parsed?.message) return parsed.message;
    } catch {
      // not JSON — fall through to the generic message
    }
  }
  return fallback;
}

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
  const [form16FinancialYear, setForm16FinancialYear] = useState(
    currentFinancialYear(),
  );
  const [downloadingForm16, setDownloadingForm16] = useState(false);

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
      {
        key: "tds",
        label: "TDS",
        render: (row: any) => (row.tds ? money(row.tds) : "—"),
      },
      {
        key: "advanceDeduction",
        label: "Advance EMI",
        render: (row: any) =>
          row.advanceDeduction ? money(row.advanceDeduction) : "—",
      },
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
          } catch (err) {
            setAlert({
              open: true,
              message: await extractBlobErrorMessage(
                err,
                "Failed to download payslip",
              ),
              severity: "error",
            });
          }
        },
      },
      {
        icon: <ReceiptLongIcon sx={{ fontSize: 16 }} />,
        label: "Download TDS Worksheet",
        color: "primary" as const,
        onClick: async () => {
          try {
            const res = await apiClient(
              `/generate-tds-worksheet/${row.userId}/${row.year}/${row.month}`,
              { responseType: "blob" },
            );
            const url = URL.createObjectURL(res.data);
            const a = document.createElement("a");
            a.href = url;
            a.download = `tds_worksheet_${MONTHS[(row.month ?? 1) - 1]}_${row.year}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
          } catch (err) {
            setAlert({
              open: true,
              message: await extractBlobErrorMessage(
                err,
                "Failed to download TDS worksheet",
              ),
              severity: "error",
            });
          }
        },
      },
    ],
    [setAlert],
  );

  const memoizedData = useMemo(() => data || [], [data]);

  const downloadForm16 = async () => {
    const userId = memoizedData[0]?.userId;
    if (!userId) {
      setAlert({
        open: true,
        message: "No payslips found yet to determine your employee record.",
        severity: "error",
      });
      return;
    }
    setDownloadingForm16(true);
    try {
      const res = await apiClient(
        `/generate-form16/${userId}/${form16FinancialYear}`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form16_${form16FinancialYear}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setAlert({
        open: true,
        message: await extractBlobErrorMessage(
          err,
          "Failed to download Form 16",
        ),
        severity: "error",
      });
    } finally {
      setDownloadingForm16(false);
    }
  };

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <Box sx={{ mb: 1.5 }}>
        <Box component="span" sx={{ fontSize: 13, color: "text.secondary" }}>
          Downloaded PDFs are password-protected — enter your PAN followed by
          your date of birth as DDMMYYYY (e.g. AAAAA0000A15081990) to open them.
        </Box>
      </Box>
      <Box sx={{ display: "flex", alignItems: "flex-end", gap: 1.5, mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Financial Year</InputLabel>
          <Select
            label="Financial Year"
            value={form16FinancialYear}
            onChange={(e) => setForm16FinancialYear(e.target.value)}
          >
            {financialYearOptions().map((fy) => (
              <MenuItem key={fy} value={fy}>
                FY {fy}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outline"
          size="small"
          icon={<DescriptionIcon sx={{ fontSize: 16 }} />}
          onClick={downloadForm16}
          disabled={downloadingForm16}
          loading={downloadingForm16}
          loadingText="Generating…"
        >
          Download Form 16
        </Button>
      </Box>
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
