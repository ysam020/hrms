import * as XLSX from "xlsx";

/**
 * Converts camelCase, PascalCase, or snake_case strings to proper Title Case with spaces
 * @param {string} str - The string to convert
 * @returns {string} - Formatted string with proper spacing and casing
 */
const formatFieldName = (str) => {
  // First, handle snake_case by replacing underscores with spaces
  let formatted = str.replace(/_/g, " ");

  // Then handle camelCase and PascalCase by adding spaces before capital letters
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Convert to Title Case
  return formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

/**
 * Transforms data keys to have proper field names with spacing and casing
 * @param {Array} data - Array of objects to transform
 * @returns {Array} - Transformed data with proper field names
 */
const transformDataForExport = (data) => {
  if (!data || data.length === 0) return [];

  return data.map((item) => {
    const transformedItem = {};
    Object.keys(item).forEach((key) => {
      const formattedKey = formatFieldName(key);
      transformedItem[formattedKey] = item[key];
    });
    return transformedItem;
  });
};

/**
 * Downloads data as an Excel file
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Name of the file (without extension)
 * @param {string} sheetName - Name of the worksheet (optional, defaults to 'Sheet1')
 * @param {Object} options - Additional options
 * @param {boolean} options.formatFieldNames - Whether to format field names (default: true)
 * @param {Object} options.columnWidths - Object with column widths { 'Column Name': width }
 * @returns {boolean} - Returns true if successful, false if failed
 */
export const downloadExcel = (
  data,
  filename,
  sheetName = "Sheet1",
  options = {}
) => {
  try {
    const { formatFieldNames = true, columnWidths = {} } = options;

    if (!data || data.length === 0) {
      throw new Error("No data provided for export");
    }

    // Transform data if field formatting is enabled
    const exportData = formatFieldNames ? transformDataForExport(data) : data;

    // Create a new workbook
    const wb = XLSX.utils.book_new();

    // Convert data to worksheet
    const ws = XLSX.utils.json_to_sheet(exportData);

    // Set column widths if provided
    if (Object.keys(columnWidths).length > 0) {
      const cols = [];
      const headers = Object.keys(exportData[0] || {});

      headers.forEach((header) => {
        cols.push({
          wch: columnWidths[header] || 15, // Default width of 15
        });
      });

      ws["!cols"] = cols;
    }

    // Add the worksheet to the workbook
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generate filename with .xlsx extension
    const fullFilename = filename.endsWith(".xlsx")
      ? filename
      : `${filename}.xlsx`;

    // Write the file
    XLSX.writeFile(wb, fullFilename);

    return true;
  } catch (error) {
    console.error("Error downloading Excel file:", error);
    return false;
  }
};

/**
 * Helper function to generate filename with current date
 * @param {string} baseName - Base name for the file
 * @param {string} date - Date string in format 'YYYY-MM' or 'MM-YYYY'
 * @returns {string} - Generated filename
 */
export const generateFilename = (baseName, date) => {
  if (!date) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    date = `${year}-${month}`;
  }

  // Handle both 'YYYY-MM' and 'MM-YYYY' formats
  const [part1, part2] = date.split("-");
  const isYearFirst = part1.length === 4;
  const year = isYearFirst ? part1 : part2;
  const month = isYearFirst ? part2 : part1;

  return `${baseName}_${month}_${year}`;
};

// Example usage and test cases:
/*
console.log(formatFieldName("firstName")); // "First Name"
console.log(formatFieldName("FirstName")); // "First Name"
console.log(formatFieldName("first_name")); // "First Name"
console.log(formatFieldName("user_id")); // "User Id"
console.log(formatFieldName("userID")); // "User I D"
console.log(formatFieldName("created_at")); // "Created At"
console.log(formatFieldName("isActive")); // "Is Active"
console.log(formatFieldName("phone_number")); // "Phone Number"
*/
