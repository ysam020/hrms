import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ViewAttendances from "@web/features/attendance/ViewAttendances";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import {
  downloadExcel,
  generateFilename,
} from "@web/shared/utils/downloadReport";

const mocks = vi.hoisted(() => ({ instance: vi.fn() }));
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/utils/downloadReport", () => ({
  downloadExcel: vi.fn(),
  generateFilename: vi.fn(() => "Attendances_2024-06"),
}));
const mockDownloadExcel = downloadExcel as unknown as ReturnType<typeof vi.fn>;

function makeRow(overrides: Partial<any> = {}) {
  return {
    username: "jdoe",
    firstName: "Jane",
    lastName: "Doe",
    presents: 20,
    halfDays: 1,
    totalLeaves: 2,
    paidLeaves: 1,
    unpaidLeaves: 1,
    correctionsUsed: 0,
    ...overrides,
  };
}

function renderWith(setAlert = vi.fn()) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <ViewAttendances />
    </AlertContext.Provider>,
  );
}

describe("ViewAttendances", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
  });

  it("shows an empty state when there are no records", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { records: [], pagination: { totalCount: 0 } } },
    });
    renderWith();
    expect(
      await screen.findByText("No attendance records found"),
    ).toBeInTheDocument();
  });

  it("renders each row's employee label and attendance counts", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { records: [makeRow()], pagination: { totalCount: 1 } } },
    });
    renderWith();
    expect(await screen.findByText("Jane Doe (jdoe)")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  it("shows a network-specific error message when the fetch fails", async () => {
    const setAlert = vi.fn();
    mockApiClient.mockRejectedValue(new Error("Network Error"));
    renderWith(setAlert);
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message:
            "Network Error, your details will be submitted when you are back online",
        }),
      ),
    );
  });

  it("shows the server error message for a non-network failure", async () => {
    const setAlert = vi.fn();
    mockApiClient.mockRejectedValue({
      response: { data: { message: "Tenant not found" } },
    });
    renderWith(setAlert);
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Tenant not found",
        }),
      ),
    );
  });

  it("refetches when the Refresh button is clicked", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { records: [makeRow()], pagination: { totalCount: 1 } } },
    });
    renderWith();
    await screen.findByText("Jane Doe (jdoe)");
    const callsBefore = mockApiClient.mock.calls.length;

    fireEvent.click(screen.getByLabelText("Refresh attendance data"));

    await waitFor(() =>
      expect(mockApiClient.mock.calls.length).toBeGreaterThan(callsBefore),
    );
  });

  it("disables the download button when there is no data", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { records: [], pagination: { totalCount: 0 } } },
    });
    renderWith();
    await screen.findByText("No attendance records found");
    expect(
      screen.getByLabelText("Download attendance as Excel"),
    ).toBeDisabled();
  });

  it("downloads an Excel export and shows a success alert", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { records: [makeRow()], pagination: { totalCount: 1 } } },
    });
    mockDownloadExcel.mockResolvedValue(true);
    const setAlert = vi.fn();
    renderWith(setAlert);
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Download attendance as Excel"));

    await waitFor(() => expect(mockDownloadExcel).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Download completed successfully",
      }),
    );
  });

  it("shows a download-specific error message when the export fetch fails", async () => {
    mockApiClient
      .mockResolvedValueOnce({
        data: { data: { records: [makeRow()], pagination: { totalCount: 1 } } },
      })
      .mockRejectedValueOnce({
        response: { data: { message: "Export failed" } },
      });
    const setAlert = vi.fn();
    renderWith(setAlert);
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByLabelText("Download attendance as Excel"));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Download failed: Export failed",
        }),
      ),
    );
  });
});
