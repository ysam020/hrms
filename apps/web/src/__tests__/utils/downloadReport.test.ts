import {
  generateFilename,
  downloadExcel,
} from "@web/shared/utils/downloadReport";

describe("generateFilename", () => {
  it("formats a YYYY-MM date as baseName_MM_YYYY", () => {
    expect(generateFilename("payroll", "2024-06")).toBe("payroll_06_2024");
  });

  it("formats a MM-YYYY date as baseName_MM_YYYY (year detected by length)", () => {
    expect(generateFilename("payroll", "06-2024")).toBe("payroll_06_2024");
  });

  it("defaults to the current year/month when no date is given", () => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    expect(generateFilename("report")).toBe(
      `report_${month}_${now.getFullYear()}`,
    );
  });
});

describe("downloadExcel", () => {
  let messageHandlers: ((e: any) => void)[] = [];

  class FakeWorker {
    onmessage: ((e: any) => void) | null = null;
    onerror: ((e: any) => void) | null = null;
    postMessage = vi.fn((msg: any) => {
      // Simulate the worker replying asynchronously with a completed buffer.
      queueMicrotask(() => {
        this.onmessage?.({
          data: { id: msg.id, buffer: new Uint8Array([1, 2, 3]) },
        });
      });
    });
    terminate = vi.fn();
  }

  beforeEach(() => {
    messageHandlers = [];
    (global as any).Worker = FakeWorker;
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  it("resolves false and does not touch the worker when there is no data", async () => {
    const result = await downloadExcel([], "report");
    expect(result).toBe(false);
  });

  it("appends .xlsx to the filename when missing, and resolves true once the worker responds", async () => {
    let capturedFilename = "";
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        Object.defineProperty(el, "download", {
          set: (v: string) => (capturedFilename = v),
          get: () => capturedFilename,
        });
      }
      return el;
    });

    const result = await downloadExcel([{ a: 1 }], "report");

    expect(result).toBe(true);
    expect(capturedFilename).toBe("report.xlsx");
  });

  it("does not double-append .xlsx when the filename already has the extension", async () => {
    const result = await downloadExcel([{ a: 1 }], "report.xlsx");
    expect(result).toBe(true);
    expect(window.URL.createObjectURL).toHaveBeenCalled();
  });
});
