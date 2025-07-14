import generateSkeletonData from "../utils/generateSkeletonData";
import { useTheme } from "@mui/material";

function useTableConfig(data, columns, loading) {
  const theme = useTheme();
  const baseBackgroundColor =
    theme.palette.mode === "dark" ? "#1C262B" : "rgb(253, 253, 253);";

  const table = {
    columns,
    data: loading ? generateSkeletonData(columns) : data,
    enableColumnResizing: true,
    enableColumnOrdering: false,
    enablePagination: false,
    enableTopToolbar: true,
    enableBottomToolbar: false,
    enableGrouping: true,
    enableDensityToggle: false, // Disable density toggle
    initialState: { density: "compact" }, // Set initial table density to compact
    enableColumnFilters: false, // Disable column filters
    enableColumnActions: false,
    enableStickyHeader: true, // Enable sticky header
    muiTablePaperProps: {
      sx: {
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)", // soft shadow
        borderRadius: 2, // optional rounded corners
        marginTop: "10px",
      },
    },
    muiTableContainerProps: {
      sx: { maxHeight: "590px", overflowY: "auto" },
    },
    muiTableHeadCellProps: {
      sx: {
        position: "sticky",
        top: 0,
        zIndex: 1,
      },
    },
    muiTableBodyProps: {
      sx: {
        "& tr:not([data-selected='true']):not([data-pinned='true']) > td": {
          backgroundColor: baseBackgroundColor, // Consistent background color
        },
      },
    },
    mrtTheme: () => ({
      baseBackgroundColor: baseBackgroundColor,
    }),
    renderEmptyRowsFallback: () => (
      <div className="flex-div">
        <p style={{ width: "100%", textAlign: "center" }}>No records</p>
      </div>
    ),
  };

  return table;
}

export default useTableConfig;
