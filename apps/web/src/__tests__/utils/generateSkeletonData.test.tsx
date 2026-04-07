import { isValidElement } from "react";
import generateSkeletonData from "@web/shared/utils/generateSkeletonData";

const columns = [
  { accessorKey: "name", size: 150 },
  { accessorKey: "email", size: 200 },
  { accessorKey: "role" }, // no size — defaults to "100%"
];

describe("generateSkeletonData", () => {
  it("returns an array of exactly 3 items", () => {
    const data = generateSkeletonData(columns);
    expect(data).toHaveLength(3);
  });

  it("each item has a key for every column accessorKey", () => {
    const data = generateSkeletonData(columns);
    for (const row of data) {
      expect(row).toHaveProperty("name");
      expect(row).toHaveProperty("email");
      expect(row).toHaveProperty("role");
    }
  });

  it("each cell value is a valid React element (MUI Skeleton)", () => {
    const data = generateSkeletonData(columns);
    for (const row of data) {
      expect(isValidElement(row.name)).toBe(true);
      expect(isValidElement(row.email)).toBe(true);
      expect(isValidElement(row.role)).toBe(true);
    }
  });

  it("uses column.size as Skeleton width when provided", () => {
    const data = generateSkeletonData(columns);
    const nameCell = data[0].name as React.ReactElement<any>;
    expect(nameCell.props.width).toBe(150);
  });

  it("falls back to '100%' width when column has no size", () => {
    const data = generateSkeletonData(columns);
    const roleCell = data[0].role as React.ReactElement<any>;
    expect(roleCell.props.width).toBe("100%");
  });

  it("returns empty-object rows for empty columns array", () => {
    const data = generateSkeletonData([]);
    expect(data).toHaveLength(3);
    for (const row of data) {
      expect(Object.keys(row)).toHaveLength(0);
    }
  });
});
