import ExcelJS from "exceljs";
import { Readable } from "stream";
import {
  EMPLOYEES_TAB,
  ImportColumn,
  validateRow,
} from "./onboardingImportSpec";

// Cell values for date/number columns come back as native Date/number from
// exceljs; a stray formula-result cell comes back as {result, ...} instead
// of a scalar. Normalize all of that down to the plain string validateRow
// expects, rather than teaching validateRow about ExcelJS's cell shapes.
function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "result" in (value as any)) {
    return cellText((value as any).result);
  }
  // Rich-text cells (mixed run-level formatting within one cell — a common
  // side effect of pasting from Word/Outlook/a browser, or some paste paths
  // in Excel itself) round-trip as { richText: [{text, font}, ...] }, not a
  // plain string. Without this, String(value) on the object produces the
  // literal string "[object Object]" instead of the cell's actual text.
  if (
    typeof value === "object" &&
    "richText" in (value as any) &&
    Array.isArray((value as any).richText)
  ) {
    return (value as any).richText
      .map((run: any) => run?.text ?? "")
      .join("")
      .trim();
  }
  if (typeof value === "object" && "text" in (value as any)) {
    return String((value as any).text);
  }
  // A formula that errored (#VALUE!, #DIV/0!, #REF!, ...) round-trips as
  // { error: "#VALUE!" } — surface the error code itself rather than
  // silently falling through to the object-stringification case below.
  if (typeof value === "object" && "error" in (value as any)) {
    return String((value as any).error);
  }
  if (typeof value === "object" && value !== null) {
    // An ExcelJS cell shape genuinely not accounted for above. Falling
    // through to String(value) here produces the literal, useless text
    // "[object Object]" with no way to tell what the cell actually held —
    // stringify it instead so whatever this turns out to be is visible
    // directly in the validation error message.
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

// CSV has no per-cell formatting/validation/locking, so the template is just
// the header row — no dropdowns (Department/Designation were never actually
// enforced against a known list server-side anyway, just an Excel-only
// typing aid) and no protected header. A stray edited header is still
// caught the same way as before, at parse time (see parseSheet below).
export async function buildOnboardingTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(EMPLOYEES_TAB.sheetName);
  sheet.columns = EMPLOYEES_TAB.columns.map((c) => ({
    header: c.header,
    key: c.key,
  }));
  return workbook.csv.writeBuffer();
}

export interface ParsedRow {
  rowNumber: number;
  values: Record<string, unknown>;
}

export interface RowError {
  row: number;
  message: string;
}

export interface TabParseResult {
  sheetName: string;
  rows: ParsedRow[];
  errors: RowError[];
}

function isRowBlank(raw: Record<string, unknown>): boolean {
  return Object.values(raw).every(
    (v) => v === null || v === undefined || v === "",
  );
}

export function parseSheet(
  worksheet: ExcelJS.Worksheet | undefined,
  sheetName: string,
  columns: readonly ImportColumn[],
): TabParseResult {
  const errors: RowError[] = [];
  const rows: ParsedRow[] = [];

  if (!worksheet) {
    errors.push({
      row: 0,
      message: `Could not read this as a CSV file — make sure it's the unmodified template, saved/exported as .csv`,
    });
    return { sheetName, rows, errors };
  }

  const headerRow = worksheet.getRow(1);
  columns.forEach((col, idx) => {
    const headerCell = cellText(headerRow.getCell(idx + 1).value);
    if (headerCell !== col.header) {
      errors.push({
        row: 1,
        message: `Column ${idx + 1} should be "${col.header}" but found "${headerCell || "(empty)"}" — please re-download the template rather than editing headers`,
      });
    }
  });
  if (errors.length > 0) return { sheetName, rows, errors };

  const lastRow = worksheet.actualRowCount;
  for (let r = 2; r <= lastRow; r++) {
    const excelRow = worksheet.getRow(r);
    const raw: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      raw[col.key] = cellText(excelRow.getCell(idx + 1).value);
    });
    if (isRowBlank(raw)) continue;

    const { errors: rowErrors, values } = validateRow(columns, raw);
    rowErrors.forEach((message) => errors.push({ row: r, message }));
    rows.push({ rowNumber: r, values });
  }

  return { sheetName, rows, errors };
}

export async function parseWorkbook(
  buffer: Buffer,
): Promise<{ employees: TabParseResult }> {
  // csv.read() returns the (single, unnamed) worksheet directly rather than
  // a workbook to look a sheet up on — CSV has no concept of multiple named
  // sheets. A malformed/non-CSV upload throws here; treat that the same way
  // parseSheet already treats a genuinely missing sheet.
  let worksheet: ExcelJS.Worksheet | undefined;
  try {
    const workbook = new ExcelJS.Workbook();
    worksheet = await workbook.csv.read(Readable.from(buffer));
  } catch {
    worksheet = undefined;
  }
  const employees = parseSheet(
    worksheet,
    EMPLOYEES_TAB.sheetName,
    EMPLOYEES_TAB.columns,
  );
  return { employees };
}
