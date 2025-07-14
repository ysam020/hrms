import React, { useContext, useEffect, useMemo } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import { AlertContext } from "../../../contexts/AlertContext";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { Calendar } from "primereact/calendar";

function ViewHolidays(props) {
  const { setAlert } = useContext(AlertContext);

  useEffect(() => {
    props.getHolidays();
    // eslint-disable-next-line
  }, [props.date]);

  const deleteHoliday = async (date) => {
    try {
      await apiClient.put("/delete-holiday", { date });
      props.getHolidays();
    } catch (err) {
      setAlert({
        open: true,
        message: err.response.data.message,
        severity: "error",
      });
    }
  };

  // Memoized columns
  const columns = useMemo(
    () => [
      { accessorKey: "name", header: "Name", size: 400 },
      { accessorKey: "date", header: "Date", size: 200 },
      {
        accessorKey: "delete",
        header: "Delete",
        size: 220,
        Cell: ({ cell }) => {
          const data = cell.row.original;
          return (
            <span
              className="link reject-link"
              onClick={() => deleteHoliday(data.date)}
            >
              Delete
            </span>
          );
        },
      },
    ],
    // eslint-disable-next-line
    []
  );

  // Memoize API data
  const memoizedData = useMemo(() => props.data, [props.data]);

  // Call `useTableConfig` at the top level
  const tableConfig = useTableConfig(memoizedData, columns);

  const table = useMaterialReactTable({
    ...tableConfig,
    renderTopToolbarCustomActions: () => (
      <>
        <div>
          <Calendar
            value={props.date}
            onChange={(e) => props.setDate(e.value)}
            view="year"
            dateFormat="yy"
            showIcon
          />
        </div>
      </>
    ),
  });

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        <MaterialReactTable table={table} />
      </ErrorBoundary>
    </div>
  );
}

export default React.memo(ViewHolidays);
