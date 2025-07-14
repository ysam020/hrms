import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  MaterialReactTable,
  useMaterialReactTable,
} from "material-react-table";
import useTableConfig from "../../../hooks/useTableConfig";
import apiClient from "../../../config/axiosConfig";
import { getTableColumns } from "../../../utils/table/getTableColumns";
import useUserList from "../../../hooks/useUserList";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import useUserAutoComplete from "../../../hooks/useUserAutocomplete";

function ViewTrainings() {
  const [data, setData] = useState([]);

  const userList = useUserList();
  const { selectedUser, toolbarActions } = useUserAutoComplete(userList);

  const dataCache = useRef(new Map());

  useEffect(() => {
    async function getData() {
      if (selectedUser && userList.includes(selectedUser)) {
        if (dataCache.current.has(selectedUser)) {
          setData(dataCache.current.get(selectedUser));
          return;
        }

        try {
          const res = await apiClient(`/view-trainings/${selectedUser}`);
          setData(res.data);
          dataCache.current.set(selectedUser, res.data); // Cache the data
        } catch (error) {
          console.error("Error occurred while fetching trainings:", error);
          setData([]);
        }
      }
    }

    getData();
  }, [selectedUser, userList]);

  const baseColumns = useMemo(
    () => [
      { accessorKey: "trainingProgram", header: "Training Program" },
      { accessorKey: "trainingDate", header: "Training Date" },
      { accessorKey: "trainingProvider", header: "Training Provider" },
      { accessorKey: "duration", header: "Duration" },
      { accessorKey: "feedback", header: "Feedback" },
    ],
    []
  );

  const columns = useMemo(() => getTableColumns(baseColumns), [baseColumns]);
  const memoizedData = useMemo(() => data, [data]);
  const tableConfig = useTableConfig(memoizedData, columns);

  const table = useMaterialReactTable({
    ...tableConfig,
    ...toolbarActions,
  });

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <MaterialReactTable table={table} />
    </ErrorBoundary>
  );
}

export default React.memo(ViewTrainings);
