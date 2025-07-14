import React, {
  useEffect,
  useState,
  useCallback,
  useMemo,
  useContext,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import { useNavigate } from "react-router-dom";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "../../../contexts/AlertContext";
import { downloadExcel, generateFilename } from "../../../utils/downloadReport";
import { IconButton, Tooltip } from "@mui/material";
import { Download } from "@mui/icons-material";

function ViewKycList() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const { setAlert } = useContext(AlertContext);
  const navigate = useNavigate();

  // Memoized API Call
  const getData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient("/view-all-kycs");
      setData(res.data);
    } catch (err) {
      setData([]);
      setAlert({
        open: true,
        message:
          err.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : err.response?.data?.message || "Something went wrong",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    getData();
  }, [getData]);

  // Memoized Data to Prevent Unnecessary Re-renders
  const memoizedData = useMemo(() => data, [data]);

  // Function to handle Excel download
  const handleDownloadExcel = useCallback(() => {
    try {
      if (!data || data.length === 0) {
        setAlert({
          open: true,
          message: "No data available to download.",
          severity: "warning",
        });
        return;
      }

      // Prepare data for export
      const exportData = data.map((item) => ({
        first_name: item.first_name,
        middle_name: item.middle_name,
        last_name: item.last_name,
        department: item.department,
        designation: item.designation,
        employeeStatus: item.employeeStatus,
        kyc_approval: item.kyc_approval,
      }));

      // Generate filename with current date
      const filename = generateFilename("Employee_KYC");

      // Define column widths for better formatting
      const columnWidths = {
        "First Name": 20,
        "Middle Name": 20,
        "Last Name": 20,
        Department: 20,
        Designation: 20,
        Status: 20,
        "KYC Approval": 20,
      };

      // Download the Excel file
      downloadExcel(exportData, filename, "Employee_KYC", {
        formatFieldNames: true,
        columnWidths,
      });
    } catch (error) {
      console.error("Error downloading Excel file:", error);
      setAlert({
        open: true,
        message: "Failed to download Excel file. Please try again.",
        severity: "error",
      });
    }
  }, [data, setAlert]);

  // Table Columns
  const columns = [
    { accessorKey: "first_name", header: "First Name", size: 170 },
    { accessorKey: "middle_name", header: "Middle Name", size: 170 },
    { accessorKey: "last_name", header: "Last Name", size: 170 },
    { accessorKey: "department", header: "Department" },
    { accessorKey: "designation", header: "Designation" },
    { accessorKey: "employeeStatus", header: "Status", size: 120 },
    {
      accessorKey: "kyc_approval",
      header: "KYC Approval",
      Cell: ({ cell }) => {
        const value = cell.getValue();
        let className = "";

        switch (value?.toLowerCase()) {
          case "approved":
            className = "approve-link";
            break;
          case "rejected":
            className = "reject-link";
            break;
          case "pending":
            className = "pending-link";
            break;
          default:
            className = "";
        }

        return <span className={`link ${className}`}>{value}</span>;
      },
    },
  ];

  const baseConfig = useTableConfig(memoizedData, columns, loading);

  // Memoized Table Instance
  const table = useMaterialReactTable(
    useMemo(
      () => ({
        ...baseConfig,
        renderTopToolbarCustomActions: () => (
          <div className="table-topbar">
            <div></div>
            <Tooltip title="Download Excel">
              <IconButton
                onClick={handleDownloadExcel}
                disabled={!data || data.length === 0}
                color="primary"
              >
                <Download />
              </IconButton>
            </Tooltip>
          </div>
        ),
        muiTableBodyRowProps: ({ row }) => ({
          onClick: () => navigate(`/view-kyc/${row.original.username}`),
          style: { cursor: "pointer" },
        }),
      }),
      [baseConfig, navigate]
    )
  );

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        {loading ? (
          <p>Loading KYC data...</p>
        ) : (
          <MaterialReactTable table={table} />
        )}
      </ErrorBoundary>
    </div>
  );
}

export default React.memo(ViewKycList);
