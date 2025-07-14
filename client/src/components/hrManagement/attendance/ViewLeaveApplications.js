import React, {
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import { IconButton, Tooltip } from "@mui/material";
import { Download } from "@mui/icons-material";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import { AlertContext } from "../../../contexts/AlertContext";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { UserContext } from "../../../contexts/UserContext";
import { downloadExcel, generateFilename } from "../../../utils/downloadReport";

function ViewLeaveApplications() {
  const [data, setData] = useState([]);
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);

  const getLeaveApplications = useCallback(async () => {
    try {
      const res = await apiClient(`/get-leave-applications`);
      setData(res.data);
    } catch (error) {
      console.error(error);
      setAlert({
        open: true,
        message: "Failed to fetch leave applications. Please try again.",
        severity: "error",
      });
    }
  }, [setAlert]);

  useEffect(() => {
    getLeaveApplications();
  }, [getLeaveApplications]);

  const handleLeaveApproval = useCallback(
    async (_id, username, status) => {
      try {
        await apiClient.put(`/update-leave-status`, { _id, username, status });
        getLeaveApplications();
      } catch (error) {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message || "An error occurred",
          severity: "error",
        });
      }
    },
    [setAlert, getLeaveApplications]
  );

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
        username: item.username,
        from: item.from,
        to: item.to,
        reason: item.reason,
        sickLeave: item.sick_leave,
        status: item.status,
      }));

      // Generate filename with current date
      const filename = generateFilename("Leave_Applications");

      // Define column widths for better formatting
      const columnWidths = {
        Username: 20,
        From: 15,
        To: 15,
        Reason: 30,
        "Sick Leave": 15,
        "Medical Certificate": 20,
        Status: 15,
      };

      // Download the Excel file
      downloadExcel(exportData, filename, "Leave Applications", {
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

  // Memoized columns
  const columns = useMemo(
    () => [
      { accessorKey: "username", header: "Username", size: 160 },
      { accessorKey: "from", header: "From", size: 120 },
      { accessorKey: "to", header: "To", size: 120 },
      { accessorKey: "reason", header: "Reason", size: 200 },
      { accessorKey: "sick_leave", header: "Sick Leave", size: 130 },
      {
        accessorKey: "medical_certificate",
        header: "Medical Certificate",
        size: 180,
        Cell: ({ cell }) => {
          const { medical_certificate } = cell.row.original;
          return medical_certificate ? (
            <span className="link withdraw-link">
              <a
                href={medical_certificate}
                target="_blank"
                rel="noopener noreferrer"
              >
                View
              </a>
            </span>
          ) : (
            "No Certificate"
          );
        },
      },
      { accessorKey: "status", header: "Status", size: 150 },
      {
        accessorKey: "approve",
        header: "Action",
        size: 220,
        Cell: ({ cell }) => {
          return (
            <>
              {(user?.isSuperUser ||
                cell.row.original.username !== user?.username) && (
                <>
                  <span
                    className="link approve-link"
                    onClick={() =>
                      handleLeaveApproval(
                        cell.row.original._id,
                        cell.row.original.username,
                        "Approve"
                      )
                    }
                  >
                    Approve
                  </span>
                  <span
                    className="link reject-link"
                    onClick={() =>
                      handleLeaveApproval(
                        cell.row.original._id,
                        cell.row.original.username,
                        "Reject"
                      )
                    }
                  >
                    Reject
                  </span>
                </>
              )}
            </>
          );
        },
      },
    ],
    [user, handleLeaveApproval]
  );

  // Memoize API data
  const memoizedData = useMemo(() => data, [data]);

  // Call `useTableConfig` at the top level
  const tableConfig = useTableConfig(memoizedData, columns);

  // Memoize custom toolbar actions with download button
  const customToolbarActions = useMemo(
    () => ({
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
    }),
    [data, handleDownloadExcel]
  );

  const table = useMaterialReactTable({
    ...tableConfig,
    ...customToolbarActions,
  });

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <MaterialReactTable table={table} />
      </ErrorBoundary>
    </div>
  );
}

export default React.memo(ViewLeaveApplications);
