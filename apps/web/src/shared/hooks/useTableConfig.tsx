import { useTheme } from "@mui/material";
import type { MRT_DensityState } from "material-react-table";
import { useState, useCallback, useMemo, useRef } from "react";
import generateSkeletonData from "@web/shared/utils/generateSkeletonData";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import InboxIcon from "@mui/icons-material/Inbox";

function useTableConfig(
  data: any[],
  columns: any[],
  loading: boolean,
  options: Record<string, any> = {},
) {
  const theme = useTheme();
  const baseBackgroundColor =
    theme.palette.mode === "dark" ? "#1C262B" : "rgb(253, 253, 253)";

  // Default options for server-side pagination
  const {
    enableServerSidePagination = false,
    totalRowCount = 0,
    onPaginationChange,
    onPageSizeChange,
    initialPagination = { pageIndex: 0, pageSize: 10 },
    pageSizeOptions = [5, 10, 25, 50, 100],
    ...rawCustomOptions
  } = options;

  // Stabilize customOptions so it doesn't bust the table useMemo on every render
  const customOptionsRef = useRef(rawCustomOptions);
  customOptionsRef.current = rawCustomOptions;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const customOptions = useMemo(
    () => customOptionsRef.current,
    [JSON.stringify(rawCustomOptions)],
  );

  // Pagination state for server-side pagination
  const [pagination, setPagination] = useState(initialPagination);

  // Handle pagination changes
  const handlePaginationChange = useCallback(
    (updater) => {
      const newPagination =
        typeof updater === "function" ? updater(pagination) : updater;
      setPagination(newPagination);

      if (onPaginationChange) {
        onPaginationChange(newPagination);
      }
    },
    [pagination, onPaginationChange],
  );

  // Handle page size changes
  const handlePageSizeChange = useCallback(
    (newPageSize) => {
      const newPagination = { pageIndex: 0, pageSize: newPageSize };
      setPagination(newPagination);

      if (onPageSizeChange) {
        onPageSizeChange(newPageSize);
      }
      if (onPaginationChange) {
        onPaginationChange(newPagination);
      }
    },
    [onPaginationChange, onPageSizeChange],
  );

  const table = useMemo(() => {
    const baseConfig = {
      columns,
      data: loading ? generateSkeletonData(columns) : data,
      enableColumnResizing: true,
      enableColumnOrdering: false,
      enablePagination: enableServerSidePagination ? true : false,
      enableTopToolbar: true,
      enableBottomToolbar: enableServerSidePagination ? true : false,
      enableGrouping: enableServerSidePagination ? false : true,
      enableDensityToggle: false,
      initialState: {
        density: "compact" as MRT_DensityState,
        ...(enableServerSidePagination ? { pagination } : {}),
      },
      state: {
        ...(enableServerSidePagination ? { pagination } : {}),
        isLoading: loading,
      },
      enableColumnFilters: false,
      enableColumnActions: false,
      enableStickyHeader: true,

      muiTablePaperProps: {
        sx: {
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          borderRadius: 2,
          marginTop: "10px",
        },
      },
      muiTableContainerProps: {
        sx: {
          maxHeight: enableServerSidePagination
            ? "calc(100vh - 300px)"
            : "590px",
          overflowY: "auto",
        },
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
            backgroundColor: baseBackgroundColor,
          },
        },
      },
      muiTableBodyRowProps: () => ({
        tabIndex: 0,
        sx: {
          "&:focus-visible": {
            outline: "2px solid #1976d2",
            outlineOffset: "-2px",
          },
        },
      }),
      mrtTheme: () => ({
        baseBackgroundColor: baseBackgroundColor,
      }),
      renderEmptyRowsFallback: () => (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 6,
            px: 2,
            gap: 1,
            width: "100%",
          }}
        >
          <InboxIcon
            sx={{ fontSize: 40, color: "text.disabled", opacity: 0.5 }}
          />
          <Typography variant="body2" color="text.secondary">
            {loading ? "Loading data…" : "No records found"}
          </Typography>
        </Box>
      ),
    };

    // Add server-side pagination specific configurations
    if (enableServerSidePagination) {
      return {
        ...baseConfig,
        manualPagination: true,
        rowCount: totalRowCount,
        onPaginationChange: handlePaginationChange,
        paginationDisplayMode: "pages" as const,
        muiPaginationProps: {
          color: "primary" as const,
          shape: "rounded" as const,
          showRowsPerPage: true,
          rowsPerPageOptions: pageSizeOptions,
        },
        muiTableBodyRowProps: () => ({
          tabIndex: 0,
          sx: {
            "&:focus-visible": {
              outline: "2px solid #1976d2",
              outlineOffset: "-2px",
            },
            "&:hover": {
              backgroundColor: theme.palette.action.hover,
            },
          },
        }),
        // Merge custom options
        ...customOptions,
      };
    }

    return {
      ...baseConfig,
      ...customOptions,
    };
  }, [
    columns,
    data,
    loading,
    enableServerSidePagination,
    totalRowCount,
    pagination,
    handlePaginationChange,
    handlePageSizeChange,
    pageSizeOptions,
    baseBackgroundColor,
    theme.palette.action.hover,
    customOptions,
  ]);

  return {
    table,
    pagination: enableServerSidePagination ? pagination : null,
    setPagination: enableServerSidePagination ? setPagination : null,
  };
}

export default useTableConfig;
