import Skeleton from "@mui/material/Skeleton";

const generateSkeletonData = (columns) => {
  return Array(3).fill(
    columns.reduce((acc, column) => {
      const skeletonWidth = column.size || "100%";
      acc[column.accessorKey] = <Skeleton width={skeletonWidth} />;
      return acc;
    }, {}),
  );
};

export default generateSkeletonData;
