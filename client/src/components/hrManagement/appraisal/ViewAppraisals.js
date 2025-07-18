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
import { AlertContext } from "../../../contexts/AlertContext";
import { UserContext } from "../../../contexts/UserContext";
import AddFeedbackModal from "./AddFeedbackModal";
import ViewFeedbackModal from "./ViewFeedbackModal";
import { downloadExcel, generateFilename } from "../../../utils/downloadReport";
import { IconButton, Tooltip } from "@mui/material";
import { Download } from "@mui/icons-material";

function ViewAppraisals() {
  const [data, setData] = useState([]);
  const { setAlert } = useContext(AlertContext);
  const { user } = useContext(UserContext);
  const [appraisalData, setAppraisalData] = useState({});
  const [openAddFeedbackModal, setOpenAddFeedbackModal] = useState(false);
  const [openViewFeedbackModal, setOpenViewFeedbackModal] = useState(false);

  const handleOpenAddFeedbackModal = (data) => {
    setAppraisalData(data);
    setOpenAddFeedbackModal(true);
  };
  const handleCloseAddFeedbackModal = () => setOpenAddFeedbackModal(false);

  const handleOpenViewFeedbackModal = (data) => {
    setAppraisalData(data);
    setOpenViewFeedbackModal(true);
  };
  const handleCloseViewFeedbackModal = () => setOpenViewFeedbackModal(false);

  useEffect(() => {
    let isMounted = true;

    async function getData() {
      try {
        const res = await apiClient(`/view-appraisals/`);

        // Only update state if component is still mounted
        if (isMounted) {
          setData(res.data);
        }
      } catch (error) {
        console.error("Error occurred while fetching appraisals:", error);

        if (isMounted) {
          setData([]);
        }
      }
    }

    getData();

    return () => {
      isMounted = false;
    };
  }, []);

  const deleteAppraisal = async (_id, username) => {
    try {
      await apiClient.delete(`/delete-appraisal/${username}/${_id}`);
      setData((prevData) =>
        prevData.filter((item) => item._id.toString() !== _id.toString())
      );
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
        appraisalDate: new Date(item.appraisalDate).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }
        ),
        areasOfImprovement: item.areasOfImprovement || "N/A",
        score: item.score || "N/A",
        strengths: item.strengths || "N/A",
      }));

      // Generate filename with current date
      const filename = generateFilename("Appraisals");

      // Define column widths for better formatting
      const columnWidths = {
        Username: 20,
        "Appraisal Date": 20,
        "Areas Of Improvement": 30,
        Score: 15,
        Strengths: 30,
      };

      // Download the Excel file
      downloadExcel(exportData, filename, "Appraisals", {
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
      { accessorKey: "username", header: "Username", size: 180 },
      { accessorKey: "appraisalDate", header: "Appraisal Date", size: 150 },
      {
        accessorKey: "areasOfImprovement",
        header: "Areas of Improvement",
        size: 250,
      },
      { accessorKey: "score", header: "Score", size: 120 },
      { accessorKey: "strengths", header: "Strengths", size: 250 },
      {
        accessorKey: "actions",
        header: "Actions",
        size: 330,
        Cell: ({ cell }) => {
          const rowData = cell.row.original;
          return (
            <>
              <span
                className="link withdraw-link"
                onClick={() => handleOpenViewFeedbackModal(rowData)}
              >
                View Feedback
              </span>

              {(rowData.username !== user.username || user.isSuperUser) && (
                <span
                  className="link info-link"
                  onClick={() => handleOpenAddFeedbackModal(rowData)}
                >
                  Provide Feedback
                </span>
              )}

              {(rowData.username === user.username || user.isSuperUser) && (
                <span
                  className="link reject-link"
                  onClick={() => deleteAppraisal(rowData._id, rowData.username)}
                >
                  Delete
                </span>
              )}
            </>
          );
        },
      },
    ],
    // eslint-disable-next-line
    []
  );

  const tableConfig = useTableConfig(data, columns);

  const table = useMaterialReactTable({
    ...tableConfig,
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

      <AddFeedbackModal
        open={openAddFeedbackModal}
        handleClose={handleCloseAddFeedbackModal}
        appraisalData={appraisalData}
      />

      <ViewFeedbackModal
        open={openViewFeedbackModal}
        handleClose={handleCloseViewFeedbackModal}
        appraisalData={appraisalData}
      />
    </ErrorBoundary>
  );
}

export default React.memo(ViewAppraisals);
