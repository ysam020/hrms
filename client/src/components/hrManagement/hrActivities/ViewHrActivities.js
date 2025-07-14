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
import { Skeleton, Switch, FormControlLabel } from "@mui/material";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import { getTableColumns } from "../../../utils/table/getTableColumns";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import EditHrActivityModal from "./EditHrActivityModal";
import { AlertContext } from "../../../contexts/AlertContext";
import { downloadExcel, generateFilename } from "../../../utils/downloadReport";
import { IconButton, Tooltip } from "@mui/material";
import { Download } from "@mui/icons-material";

function ViewHrActivities() {
  const [data, setData] = useState([]);
  const [activityData, setActivityData] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);
  const [loading, setLoading] = useState(false);
  const { setAlert } = useContext(AlertContext);

  const handleOpenModal = (data) => {
    setActivityData(data);
    setOpenModal(true);
  };
  const handleCloseModal = () => setOpenModal(false);

  async function getData(fetchAll = false) {
    setLoading(true);
    try {
      const res = await apiClient(`/get-hr-activities?all=${fetchAll}`);
      setData(res.data);
    } catch (error) {
      console.error(error);
      setAlert({
        open: true,
        message: "Failed to fetch HR activities",
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getData(showAllActivities);
  }, [showAllActivities]);

  const handleToggleChange = (event) => {
    setShowAllActivities(event.target.checked);
  };

  const memoizedData = useMemo(() => data, [data]);

  const deleteHrActivity = async (id) => {
    try {
      await apiClient.delete(`/delete-hr-activity/${id}`);
      setData((prevData) =>
        prevData.filter((item) => item._id.toString() !== id.toString())
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
        title: item.title,
        description: item.description,
        date: item.date,
        time: item.time,
      }));

      // Generate filename with current date
      const filename = generateFilename("HR_Activities");

      // Define column widths for better formatting
      const columnWidths = {
        Title: 25,
        Description: 30,
        Date: 15,
        Time: 10,
      };

      // Download the Excel file
      downloadExcel(exportData, filename, "HR_Activities", {
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

  const baseColumns = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Title",
      },
      {
        accessorKey: "description",
        header: "Description",
      },
      {
        accessorKey: "date",
        header: "Date",
        Cell: ({ cell }) => {
          const date = cell.getValue();
          const formatDate = (dateString) => {
            if (!dateString || typeof dateString !== "string") {
              return <Skeleton width="50%" />;
            }
            const [year, month, day] = dateString.split("-");
            return `${day}-${month}-${year}`;
          };

          return date ? formatDate(date) : "";
        },
      },
      {
        accessorKey: "time",
        header: "Time",
      },
      {
        accessorKey: "actions",
        header: "Actions",
        Cell: ({ cell }) => {
          return (
            <>
              <span
                className="link info-link"
                onClick={() => handleOpenModal(cell.row.original)}
              >
                Edit
              </span>

              <span
                className="link reject-link"
                onClick={() => deleteHrActivity(cell.row.original._id)}
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

  const columns = useMemo(() => getTableColumns(baseColumns), [baseColumns]);
  const baseConfig = useTableConfig(memoizedData, columns);

  const table = useMaterialReactTable({
    ...baseConfig,
    state: {
      ...baseConfig.state,
      isLoading: loading,
    },
    renderTopToolbarCustomActions: () => (
      <div
        style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}
      >
        <div style={{ flex: 1 }}></div>
        <div>
          <FormControlLabel
            sx={{ justifyContent: "flex-end" }}
            control={
              <Switch
                checked={showAllActivities}
                onChange={handleToggleChange}
                color="primary"
              />
            }
            label="Show All Activities"
          />
        </div>

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

      <EditHrActivityModal
        open={openModal}
        handleClose={handleCloseModal}
        activityData={activityData}
        getData={() => getData(showAllActivities)}
      />
    </ErrorBoundary>
  );
}

export default React.memo(ViewHrActivities);
