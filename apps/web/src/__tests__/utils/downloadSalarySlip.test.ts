import downloadSalarySlip from "@web/shared/utils/downloadSalarySlip";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: vi.fn(),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

describe("downloadSalarySlip", () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;
  const originalAlert = window.alert;

  beforeEach(() => {
    vi.clearAllMocks();
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    window.alert = vi.fn();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    window.alert = originalAlert;
  });

  it("alerts and does not call the API when no date is selected", async () => {
    await downloadSalarySlip("", "u1", vi.fn(), vi.fn());
    expect(window.alert).toHaveBeenCalledWith("Please select a month and year");
    expect(mockApiClient).not.toHaveBeenCalled();
  });

  it("toggles isDownloading on then off around the request", async () => {
    mockApiClient.mockResolvedValue({
      data: new Blob(["pdf-bytes"]),
      headers: {},
    });
    const setIsDownloading = vi.fn();

    await downloadSalarySlip("2024-06", "u1", setIsDownloading, vi.fn());

    expect(setIsDownloading).toHaveBeenNthCalledWith(1, true);
    expect(setIsDownloading).toHaveBeenNthCalledWith(2, false);
  });

  it("triggers a blob download and shows a success alert", async () => {
    mockApiClient.mockResolvedValue({
      data: new Blob(["pdf-bytes"]),
      headers: {},
    });
    const setAlert = vi.fn();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    await downloadSalarySlip("2024-06", "u1", vi.fn(), setAlert);

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success" }),
    );
    clickSpy.mockRestore();
  });

  it("uses the filename from the Content-Disposition header when present", async () => {
    mockApiClient.mockResolvedValue({
      data: new Blob(["pdf-bytes"]),
      headers: {
        "content-disposition": 'attachment; filename="custom-slip.pdf"',
      },
    });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    let capturedDownloadAttr = "";
    const setAttrSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "setAttribute")
      .mockImplementation(function (this: any, name: string, value: string) {
        if (name === "download") capturedDownloadAttr = value;
      });

    await downloadSalarySlip("2024-06", "u1", vi.fn(), vi.fn());

    expect(capturedDownloadAttr).toBe("custom-slip.pdf");
    clickSpy.mockRestore();
    setAttrSpy.mockRestore();
  });

  it("parses a blob-shaped error response to extract the server error message", async () => {
    const errorBlob = new Blob([
      JSON.stringify({ message: "No payslip for this period" }),
    ]);
    mockApiClient.mockRejectedValue({
      response: { data: errorBlob, status: 404 },
    });
    const setAlert = vi.fn();

    await downloadSalarySlip("2024-06", "u1", vi.fn(), setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "No payslip for this period",
      }),
    );
  });

  it("falls back to a status-specific message when the blob error body isn't valid JSON", async () => {
    const errorBlob = new Blob(["not json"]);
    mockApiClient.mockRejectedValue({
      response: { data: errorBlob, status: 404 },
    });
    const setAlert = vi.fn();

    await downloadSalarySlip("2024-06", "u1", vi.fn(), setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Salary data not found for the selected period",
      }),
    );
  });

  it("falls back to a generic message for a non-blob, non-response error", async () => {
    mockApiClient.mockRejectedValue(new Error("Network Error"));
    const setAlert = vi.fn();

    await downloadSalarySlip("2024-06", "u1", vi.fn(), setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: "Network Error" }),
    );
  });
});
