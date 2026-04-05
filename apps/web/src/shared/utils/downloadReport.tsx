/**
 * downloadExcel – offloads XLSX generation to a Web Worker so the main
 * thread never blocks while building large spreadsheets.
 *
 * Returns a Promise<boolean> that resolves once the file has been saved.
 */

let _worker: Worker | null = null;
let _pendingCallbacks: Record<
  string,
  { resolve: (v: any) => void; reject: (e: any) => void }
> = {};
let _idCounter = 0;

function getWorker() {
  if (!_worker) {
    _worker = new Worker(
      new URL("../../core/workers/excelExport.worker.ts", import.meta.url),
    );

    _worker.onmessage = ({ data }) => {
      const cb = _pendingCallbacks[data.id];
      if (!cb) return;
      delete _pendingCallbacks[data.id];

      if (data.error) {
        cb.reject(new Error(data.error));
      } else {
        cb.resolve(data.buffer);
      }
    };

    _worker.onerror = (err) => {
      // Reject all pending on worker crash and reset
      Object.values(_pendingCallbacks).forEach(({ reject }) => reject(err));
      _pendingCallbacks = {};
      _worker = null;
    };
  }
  return _worker;
}

function triggerDownload(buffer, fullFilename) {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fullFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const downloadExcel = (
  data,
  filename,
  sheetName = "Sheet1",
  options: {
    formatFieldNames?: boolean;
    columnWidths?: Record<string, number>;
  } = {},
) => {
  const { formatFieldNames = true, columnWidths = {} } = options;

  if (!data || data.length === 0) {
    console.error("No data provided for export");
    return Promise.resolve(false);
  }

  const fullFilename = filename.endsWith(".xlsx")
    ? filename
    : `${filename}.xlsx`;
  const id = ++_idCounter;

  return new Promise((resolve, reject) => {
    _pendingCallbacks[id] = {
      resolve: (buffer) => {
        try {
          triggerDownload(buffer, fullFilename);
          resolve(true);
        } catch (err) {
          reject(err);
        }
      },
      reject,
    };

    getWorker()!.postMessage({
      id,
      rawData: data,
      sheetName,
      formatFieldNames,
      columnWidths,
    });
  });
};

export const generateFilename = (baseName: string, date?: string) => {
  if (!date) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    date = `${year}-${month}`;
  }

  const [part1, part2] = date.split("-");
  const isYearFirst = part1.length === 4;
  const year = isYearFirst ? part1 : part2;
  const month = isYearFirst ? part2 : part1;

  return `${baseName}_${month}_${year}`;
};
