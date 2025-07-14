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
import { getTableColumns } from "../../../utils/table/getTableColumns";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { AlertContext } from "../../../contexts/AlertContext";

function EmployeeList() {
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

  // Table Columns
  const baseColumns = useMemo(
    () => [
      { accessorKey: "first_name", header: "First Name" },
      { accessorKey: "middle_name", header: "Middle Name" },
      { accessorKey: "last_name", header: "Last Name" },
      { accessorKey: "department", header: "Department" },
      { accessorKey: "designation", header: "Designation" },
      {
        accessorKey: "actions",
        header: "Actions",
        Cell: ({ cell }) => {
          return (
            <>
              <span
                className="link withdraw-link"
                onClick={() =>
                  navigate(
                    `/employee-management/view/${cell.row.original.username}`
                  )
                }
              >
                View Details
              </span>

              <span
                className="link info-link"
                onClick={() =>
                  navigate(
                    `/salary-management/edit/${cell.row.original.username}`
                  )
                }
              >
                Edit
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
  const baseConfig = useTableConfig(memoizedData, columns, loading);

  // Memoized Table Instance
  const table = useMaterialReactTable(
    useMemo(
      () => ({
        ...baseConfig,
        muiTableContainerProps: {
          sx: { maxHeight: "650px", overflowY: "auto" },
        },
      }),
      [baseConfig]
    )
  );

  return (
    <div>
      <ErrorBoundary fallback={<ErrorFallback />}>
        {loading ? (
          <p>Loading Employee List...</p>
        ) : (
          <MaterialReactTable table={table} />
        )}
      </ErrorBoundary>
    </div>
  );
}

export default React.memo(EmployeeList);
