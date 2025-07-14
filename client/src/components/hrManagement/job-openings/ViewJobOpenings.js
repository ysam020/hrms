import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useContext,
} from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@mui/material";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "../../../contexts/AlertContext";
import EditJobOpeningModal from "./EditJobOpeningModal";
import { downloadExcel, generateFilename } from "../../../utils/downloadReport";
import { IconButton, Tooltip } from "@mui/material";
import { Download } from "@mui/icons-material";

function ViewJobOpenings() {
  const [data, setData] = useState([]);
  const navigate = useNavigate();
  const [openModal, setOpenModal] = useState(false);
  const { setAlert } = useContext(AlertContext);
  const [jobData, setJobData] = useState(null);

  const handleOpenModal = (e, data) => {
    e.stopPropagation();
    setJobData(data);
    setOpenModal(true);
  };
  const handleCloseModal = () => setOpenModal(false);

  // Memoized API call function
  const getData = useCallback(async () => {
    if (data.length) return; // Prevent re-fetching if data already exists

    try {
      const res = await apiClient(`/view-job-openings`);
      setData(res.data);
    } catch (error) {
      console.error("Error fetching job openings:", error);
    }
  }, [data.length]);

  useEffect(() => {
    getData();
  }, [getData]);

  // Memoizing processed data
  const memoizedData = useMemo(() => data, [data]);

  const deleteJobOpening = async (e, _id) => {
    e.stopPropagation();
    try {
      await apiClient.delete(`/delete-job-opening/${_id}`);
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
        jobTitle: item.jobTitle,
        jobPostingDate: new Date(item.jobPostingDate).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }
        ),
        applicationDeadline: new Date(
          item.applicationDeadline
        ).toLocaleDateString("en-US", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }),
        numberOfVacancies: item.numberOfVacancies,
        candidatesHired: item.candidatesHired,
        location: item.location,
        budget: item.budget,
      }));

      // Generate filename with current date
      const filename = generateFilename("Job_Openings");

      // Define column widths for better formatting
      const columnWidths = {
        "Job Title": 25,
        "Job Posting Date": 15,
        "Application Deadline": 25,
        "Number Of Vacancies": 20,
        "Candidates Hired": 20,
        Location: 20,
        Budget: 20,
      };

      // Download the Excel file
      downloadExcel(exportData, filename, "Job_Openings", {
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
      {
        accessorKey: "jobTitle",
        header: "Job Title",
      },
      {
        accessorKey: "jobPostingDate",
        header: "Posting Date",
        size: 140,
        Cell: ({ cell }) => {
          return (
            <>
              {new Date(cell.row.original.jobPostingDate).toLocaleDateString(
                "en-US",
                {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                }
              ) === "Invalid Date" ? (
                <Skeleton width="50%" />
              ) : (
                new Date(cell.row.original.jobPostingDate).toLocaleDateString(
                  "en-US",
                  {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }
                )
              )}
            </>
          );
        },
      },
      {
        accessorKey: "applicationDeadline",
        header: "Deadline",
        size: 120,
        Cell: ({ cell }) => {
          return (
            <>
              {new Date(
                cell.row.original.applicationDeadline
              ).toLocaleDateString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }) === "Invalid Date" ? (
                <Skeleton width="50%" />
              ) : (
                new Date(
                  cell.row.original.applicationDeadline
                ).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                })
              )}
            </>
          );
        },
      },
      {
        accessorKey: "numberOfVacancies",
        header: "Vacancies",
        size: 120,
      },
      {
        accessorKey: "candidatesHired",
        header: "Hired",
        size: 100,
      },
      {
        accessorKey: "location",
        header: "Location",
      },
      {
        accessorKey: "budget",
        header: "Budget",
        size: 140,
        Cell: ({ cell }) => {
          return (
            <>
              {!cell.row.original.budget[0] ? (
                <Skeleton width="50%" />
              ) : (
                `${cell.row.original.budget[0]} LPA`
              )}{" "}
              -
              {!cell.row.original.budget[1] ? (
                <Skeleton width="50%" />
              ) : (
                `${cell.row.original.budget[1]} LPA`
              )}
            </>
          );
        },
      },
      {
        accessorKey: "actions",
        header: "Actions",
        size: 150,
        Cell: ({ cell }) => {
          return (
            <>
              <span
                className="link info-link"
                onClick={(e) => handleOpenModal(e, cell.row.original)}
              >
                Edit
              </span>
              <span
                className="link reject-link"
                onClick={(e) => deleteJobOpening(e, cell.row.original._id)}
              >
                Delete
              </span>
            </>
          );
        },
      },
    ],
    // eslint-disable-next-line
    []
  );

  const baseConfig = useTableConfig(memoizedData, columns);

  const tableBodyProps = {
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
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => navigate(`/view-job-opening/${row.original._id}`),
      style: { cursor: "pointer" },
    }),
  };

  const table = useMaterialReactTable({ ...baseConfig, ...tableBodyProps });

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <MaterialReactTable table={table} />

        <EditJobOpeningModal
          open={openModal}
          handleClose={handleCloseModal}
          jobData={jobData}
          getData={getData}
        />
      </ErrorBoundary>
    </div>
  );
}

export default React.memo(ViewJobOpenings);
