import React, { useEffect, useState, useMemo, useContext } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import { IconButton, Tooltip } from "@mui/material";
import { Download } from "@mui/icons-material";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import { getTableColumns } from "../../../utils/table/getTableColumns";
import { tableToolbarDate } from "../../../utils/table/tableToolbarDate";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { AlertContext } from "../../../contexts/AlertContext";
import { downloadExcel, generateFilename } from "../../../utils/downloadReport";

function ViewAttendances() {
  const [data, setData] = useState([]);
  const [date, setDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
  });
  const { setAlert } = useContext(AlertContext);

  useEffect(() => {
    async function getAttendances() {
      try {
        const [month, year] = date.split("-");
        const res = await apiClient(`/get-all-attendances/${month}/${year}`);
        setData(res.data);
      } catch (error) {
        console.error(error);
        setAlert({
          open: true,
          message: "Failed to fetch attendances. Please try again.",
          severity: "error",
        });
      }
    }
    getAttendances();
    // eslint-disable-next-line
  }, [date]);

  // Function to handle Excel download
  const handleDownloadExcel = () => {
    try {
      if (!data || data.length === 0) {
        setAlert({
          open: true,
          message: "No data available to download.",
          severity: "warning",
        });
        return;
      }

      // Generate filename with current selected date
      const filename = generateFilename("Attendances", date);

      // Define column widths for better formatting
      const columnWidths = {
        Username: 25,
        Presents: 12,
        "Half Days": 12,
        "Total Leaves": 15,
        "Paid Leaves": 15,
        "Unpaid Leaves": 15,
      };

      // Download the Excel file
      downloadExcel(data, filename, "Attendances", {
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
  };

  // Memoize data
  const memoizedData = useMemo(() => data, [data]);

  // Memoize columns
  const baseColumns = useMemo(
    () => [
      { accessorKey: "username", header: "Username" },
      { accessorKey: "presents", header: "Presents" },
      { accessorKey: "halfDays", header: "Half Days" },
      { accessorKey: "totalLeaves", header: "Total Leaves" },
      {
        accessorKey: "paidLeaves",
        header: "Paid Leaves",
      },
      {
        accessorKey: "unpaidLeaves",
        header: "Unpaid Leaves",
      },
    ],
    []
  );

  const columns = useMemo(() => getTableColumns(baseColumns), [baseColumns]);
  const tableConfig = useTableConfig(memoizedData, columns);

  // Memoize toolbar actions with download button
  const customToolbarActions = useMemo(() => {
    const dateToolbar = tableToolbarDate(date, setDate);

    return {
      ...dateToolbar,
      renderTopToolbarCustomActions: () => (
        <div className="table-topbar">
          {/* Include existing date toolbar if it has custom actions */}
          {dateToolbar.renderTopToolbarCustomActions &&
            dateToolbar.renderTopToolbarCustomActions()}

          {/* Download button */}
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
    };
  }, [date, data, handleDownloadExcel]);

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

export default React.memo(ViewAttendances);
