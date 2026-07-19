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

import ExcelJS from "exceljs";

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

self.onmessage = async ({ data }) => {
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

    const hasColumnWidths = Object.keys(columnWidths).length > 0;
    const headers = Object.keys(exportData[0] || {});

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = headers.map((h) => ({
      header: h,
      key: h,
      width: hasColumnWidths ? columnWidths[h] || 15 : undefined,
    }));
    worksheet.addRows(exportData);

    // Write to ArrayBuffer so it is transferable (zero-copy). ExcelJS's
    // browser build may return a Uint8Array whose underlying ArrayBuffer
    // is larger than the view (pooled allocation) — slice to the view's
    // exact bytes before transferring, or the extra bytes get detached too.
    const raw = await workbook.xlsx.writeBuffer();
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );

    (self as any).postMessage({ id, buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
