/**
 * Excel export worker
 *
 * Receives raw data, transforms field names, generates an XLSX file, and
 * returns the result as a transferable ArrayBuffer so the main thread can
 * trigger a download without any blocking.
 *
 * Message in:
 *   { id, rawData, sheetName, formatFieldNames, columnWidths }
 *
 * Message out (success):
 *   { id, buffer: ArrayBuffer }
 *
 * Message out (error):
 *   { id, error: string }
 */

import * as XLSX from "xlsx";

const formatFieldName = (str) => {
  let formatted = str.replace(/_/g, " ");
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2");
  return formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

const transformDataForExport = (data) => {
  if (!data || data.length === 0) return [];
  return data.map((item) => {
    const out = {};
    Object.keys(item).forEach((key) => {
      out[formatFieldName(key)] = item[key];
    });
    return out;
  });
};

self.onmessage = ({ data }) => {
  const {
    id,
    rawData,
    sheetName = "Sheet1",
    formatFieldNames = true,
    columnWidths = {},
  } = data;

  try {
    if (!rawData || rawData.length === 0) {
      self.postMessage({ id, error: "No data provided for export" });
      return;
    }

    const exportData = formatFieldNames
      ? transformDataForExport(rawData)
      : rawData;

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);

    if (Object.keys(columnWidths).length > 0) {
      const headers = Object.keys(exportData[0] || {});
      ws["!cols"] = headers.map((h) => ({ wch: columnWidths[h] || 15 }));
    }

    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Write to ArrayBuffer so it is transferable (zero-copy)
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

    // buffer is a Uint8Array — transfer its underlying ArrayBuffer
    (self as any).postMessage({ id, buffer: buffer.buffer }, [buffer.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
