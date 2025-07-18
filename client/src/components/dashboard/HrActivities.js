import React, { useState, useEffect, useMemo } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import { Skeleton } from "@mui/material";
import useTableConfig from "../../hooks/useTableConfig";
import apiClient from "../../config/axiosConfig";
import { getTableColumns } from "../../utils/table/getTableColumns";

function HrActivities() {
  const [data, setData] = useState([]);

  useEffect(() => {
    let isMounted = true; // Flag to track if component is mounted

    async function getData() {
      try {
        const res = await apiClient(`/get-hr-activities`);
        // Only update state if component is still mounted
        if (isMounted) {
          setData(res.data);
        }
      } catch (error) {
        console.error(error);
      }
    }

    getData();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []);

  // Memoize columns
  const memoizedColumns = useMemo(
    () =>
      getTableColumns([
        { accessorKey: "title", header: "Title" },
        { accessorKey: "description", header: "Description" },
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
        { accessorKey: "time", header: "Time" },
      ]),
    []
  );

  // Call useTableConfig at the top level
  const baseConfig = useTableConfig(data, memoizedColumns);

  // Memoize the table configuration object
  const memoizedTableConfig = useMemo(() => {
    return {
      ...baseConfig,
      enableTopToolbar: false,
      muiTableContainerProps: {
        sx: { maxHeight: "120px", overflowY: "auto" },
      },
    };
  }, [baseConfig]);

  const table = useMaterialReactTable(memoizedTableConfig);

  return (
    // <div className="dashboard-container hr-activities">
    <MaterialReactTable table={table} />
    // </div>
  );
}

export default React.memo(HrActivities);
