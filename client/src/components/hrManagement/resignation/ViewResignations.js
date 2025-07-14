import React, {
  useEffect,
  useState,
  useMemo,
  useContext,
  useCallback,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { UserContext } from "../../../contexts/UserContext";
import { AlertContext } from "../../../contexts/AlertContext";
import { Checkbox } from "@mui/material";
import ViewFeedbackModal from "./ViewFeedbackModal";
import { downloadExcel, generateFilename } from "../../../utils/downloadReport";
import { IconButton, Tooltip } from "@mui/material";
import { Download } from "@mui/icons-material";

function ViewResignations() {
  const [data, setData] = useState([]);
  console.log(data);
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const [resignationData, setResignationData] = useState(null);
  const [openModal, setOpenModal] = useState(false);

  const handleOpenModal = (data) => {
    setResignationData(data);
    setOpenModal(true);
  };
  const handleCloseModal = () => setOpenModal(false);

  const getData = async () => {
    try {
      const res = await apiClient("/view-resignations");
      setData(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    getData();
  }, []);

  const handleResignationAction = async ({ id, action, successMessage }) => {
    try {
      const res = await apiClient.put(`/${action}/${id}`);
      getData();
      setAlert({
        open: true,
        message: res.data.message || successMessage,
        severity: "success",
      });
    } catch (err) {
      setAlert({
        open: true,
        message:
          err.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : err.response?.data?.message || "Something went wrong",
        severity: "error",
      });
    }
  };

  const handleCheckboxChange = async ({ id, status, value }) => {
    try {
      const res = await apiClient.put(`/update-resignation/${id}`, {
        status,
        value,
      });
      getData();
      setAlert({
        open: true,
        message: res.data.message || `${status} updated`,
        severity: "success",
      });
    } catch (err) {
      setAlert({
        open: true,
        message:
          err.message === "Network Error"
            ? "Network Error, your changes will be saved once back online"
            : err.response?.data?.message || "Update failed",
        severity: "error",
      });
    }
  };

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
        resignation_date: new Date(item.resignation_date).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }
        ),
        last_date: new Date(item.last_date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }),
        status: item.status,
        assetsReturned: item.assetsReturned ? "Yes" : "No",
      }));

      // Generate filename with current date
      const filename = generateFilename("Resignations");

      // Define column widths for better formatting
      const columnWidths = {
        username: 25,
        resignation_date: 20,
        last_date: 20,
        status: 20,
        assetsReturned: 20,
      };

      // Download the Excel file
      downloadExcel(exportData, filename, "Resignations", {
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

  const columns = useMemo(
    () => [
      { accessorKey: "username", header: "Username" },
      {
        accessorKey: "resignation_date",
        header: "Resignation Date",
        size: 180,
        Cell: ({ cell }) => {
          const dateValue = cell.row.original?.resignation_date;
          if (typeof dateValue === "string") {
            return <>{dateValue.split("-").reverse().join("-")}</>;
          } else if (dateValue instanceof Date) {
            return <>{dateValue.toLocaleDateString("en-GB")}</>;
          } else {
            return <>N/A</>;
          }
        },
      },
      {
        accessorKey: "last_date",
        header: "Last Date",
        size: 150,
        Cell: ({ cell }) => {
          const dateValue = cell.row.original?.last_date;
          if (typeof dateValue === "string") {
            return <>{dateValue.split("-").reverse().join("-")}</>;
          } else if (dateValue instanceof Date) {
            return <>{dateValue.toLocaleDateString("en-GB")}</>;
          } else {
            return <>N/A</>;
          }
        },
      },
      { accessorKey: "status", header: "Status", size: 150 },
      {
        accessorKey: "action",
        header: "Actions",
        size: 350,
        Cell: ({ cell }) => {
          const rowData = cell.row.original;

          return (
            <>
              <span
                className="link info-link"
                onClick={() => handleOpenModal(rowData)}
              >
                View Feedback
              </span>

              {!["Withdrawn", "Rejected", "Approved"].includes(
                rowData.status
              ) &&
                (user?.isSuperUser || rowData.username !== user.username) && (
                  <span
                    className="link approve-link"
                    onClick={() =>
                      handleResignationAction({
                        id: rowData._id,
                        action: "approve-resignation",
                        successMessage: "Resignation approved successfully",
                      })
                    }
                  >
                    Approve
                  </span>
                )}

              {!["Approved", "Rejected", "Withdrawn"].includes(
                rowData.status
              ) &&
                (user?.isSuperUser || rowData.username !== user.username) && (
                  <span
                    className="link reject-link"
                    onClick={() =>
                      handleResignationAction({
                        id: rowData._id,
                        action: "reject-resignation",
                        successMessage: "Resignation rejected successfully",
                      })
                    }
                  >
                    Reject
                  </span>
                )}

              {!["Withdrawn"].includes(rowData.status) &&
                (rowData.username === user.username || user?.isSuperUser) && (
                  <span
                    className="link withdraw-link"
                    onClick={() =>
                      handleResignationAction({
                        id: rowData._id,
                        action: "withdraw-resignation",
                        successMessage: "Resignation withdrawn successfully",
                      })
                    }
                  >
                    Withdraw
                  </span>
                )}
            </>
          );
        },
      },
      {
        accessorKey: "assetsReturned",
        header: "Assets Returned",
        size: 180,
        Cell: ({ cell }) => {
          const rowData = cell.row.original;
          return (
            (user?.isSuperUser || rowData.username !== user.username) &&
            rowData.status !== "Withdrawn" &&
            rowData.status !== "Rejected" && (
              <div
                className="flex-div"
                style={{ width: "100%", justifyContent: "center" }}
              >
                <Checkbox
                  checked={rowData.assetsReturned}
                  onChange={(e) =>
                    handleCheckboxChange({
                      id: rowData._id,
                      status: "Assets Returned",
                      value: e.target.checked,
                    })
                  }
                  color="primary"
                />
              </div>
            )
          );
        },
      },
      {
        accessorKey: "fnfDone",
        header: "FnF Done",
        size: 120,
        Cell: ({ cell }) => {
          const rowData = cell.row.original;
          return (
            (user?.isSuperUser || rowData.username !== user.username) &&
            rowData.status !== "Withdrawn" &&
            rowData.status !== "Rejected" && (
              <div
                className="flex-div"
                style={{ width: "100%", justifyContent: "center" }}
              >
                <Checkbox
                  checked={rowData.fnfDone}
                  onChange={(e) =>
                    handleCheckboxChange({
                      id: rowData._id,
                      status: "FnF Done",
                      value: e.target.checked,
                    })
                  }
                  color="primary"
                />
              </div>
            )
          );
        },
      },
    ],
    // eslint-disable-next-line
    [user]
  );

  const memoizedData = useMemo(() => data, [data]);
  const baseConfig = useTableConfig(memoizedData, columns);
  const table = useMaterialReactTable({
    ...baseConfig,
    renderTopToolbarCustomActions: () => (
      <div
        style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}
      >
        <div style={{ flex: 1 }}></div>
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
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />

      <ViewFeedbackModal
        open={openModal}
        handleClose={handleCloseModal}
        resignationData={resignationData}
      />
    </ErrorBoundary>
  );
}

export default React.memo(ViewResignations);
