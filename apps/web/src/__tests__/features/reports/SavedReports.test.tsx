import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SavedReports from "@web/features/reports/SavedReports";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  instance.delete = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function report(overrides: Partial<any> = {}) {
  return {
    id: "rep1",
    name: "Active Employees",
    entity: "employee",
    description: null,
    lastRunAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function renderList(setAlert = vi.fn()) {
  render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <SavedReports />
    </AlertContext.Provider>,
  );
  return { setAlert };
}

describe("SavedReports", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.delete.mockReset();
  });

  it("shows an empty state when there are no saved reports", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [] } });
    renderList();
    expect(
      await screen.findByText("No saved reports found"),
    ).toBeInTheDocument();
  });

  it("lists reports with entity chip, description fallback, and 'Never' for last run", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [report()] } });
    renderList();
    expect(await screen.findByText("Active Employees")).toBeInTheDocument();
    expect(screen.getByText("employee")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("shows the formatted last-run date when present", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: [report({ lastRunAt: "2026-02-15T00:00:00Z" })] },
    });
    renderList();
    expect(await screen.findByText("15 Feb 2026")).toBeInTheDocument();
  });

  it("runs a saved report and shows the row count in the alert", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [report()] } });
    mockApiClient.post.mockResolvedValue({
      data: { data: { rows: [{}, {}] } },
    });
    const { setAlert } = renderList();
    await screen.findByText("Active Employees");

    fireEvent.click(screen.getByLabelText("Run report"));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/reports/saved/rep1/run",
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Active Employees: 2 row(s) returned",
      }),
    );
  });

  it("downloads a saved report as CSV", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [report()] } });
    mockApiClient.post.mockResolvedValue({ data: new Blob(["csv"]) });
    const createObjectURL = vi.fn().mockReturnValue("blob:mock");
    (global.URL as any).createObjectURL = createObjectURL;
    (global.URL as any).revokeObjectURL = vi.fn();

    renderList();
    await screen.findByText("Active Employees");
    fireEvent.click(screen.getByLabelText("Download CSV"));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/reports/saved/rep1/run?format=csv",
        {},
        { responseType: "blob" },
      ),
    );
    expect(createObjectURL).toHaveBeenCalled();
  });

  it("deletes a saved report through its confirmation dialog", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [report()] } });
    mockApiClient.delete.mockResolvedValue({});
    const { setAlert } = renderList();
    await screen.findByText("Active Employees");

    fireEvent.click(screen.getByLabelText("Delete report"));
    expect(screen.getByText("Delete this saved report?")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.delete).toHaveBeenCalledWith("/reports/saved/rep1"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Report deleted",
      }),
    );
  });

  it("cancels the delete confirmation without calling the API", async () => {
    mockApiClient.mockResolvedValue({ data: { data: [report()] } });
    renderList();
    await screen.findByText("Active Employees");

    fireEvent.click(screen.getByLabelText("Delete report"));
    fireEvent.click(screen.getByText("Cancel", { selector: "span" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Delete this saved report?"),
      ).not.toBeInTheDocument(),
    );
    expect(mockApiClient.delete).not.toHaveBeenCalled();
  });
});
