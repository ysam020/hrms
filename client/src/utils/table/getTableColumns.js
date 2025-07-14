export const getTableColumns = (baseColumns) => {
  const getColumnWidthProps = (columnsCount) => {
    const widthPercentage = Math.floor(100 / columnsCount).toFixed(2);
    return {
      muiTableHeadCellProps: {
        sx: {
          width: `${widthPercentage}%`,
        },
      },
      muiTableBodyCellProps: {
        sx: {
          width: `${widthPercentage}%`,
        },
      },
      enableSorting: false,
    };
  };

  // Apply width props to all columns
  const columns = baseColumns.map((column) => ({
    ...column,
    ...getColumnWidthProps(baseColumns.length),
  }));

  return columns;
};
