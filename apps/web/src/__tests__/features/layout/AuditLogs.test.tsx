import { render, screen, fireEvent } from "@testing-library/react";
import AuditLogs from "@web/features/layout/AuditLogs";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import useFetchData from "@web/shared/hooks/useFetchData";
import useUserList from "@web/shared/hooks/useUserList";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useUserList");
const mockUseUserList = useUserList as unknown as ReturnType<typeof vi.fn>;

function renderLogs(open = true, toggleDrawer = vi.fn(() => vi.fn())) {
  return render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <AuditLogs open={open} toggleDrawer={toggleDrawer} />
    </ThemeContext.Provider>,
  );
}

describe("AuditLogs", () => {
  beforeEach(() => {
    mockUseUserList.mockReturnValue([{ value: "u1", label: "jdoe" }]);
  });

  it("shows a loading spinner while fetching", () => {
    // AuditLogs' own Drawer uses disablePortal, which MUI's modal manager
    // wraps in an aria-hidden ancestor in this environment — role queries
    // need `hidden: true` to see past it.
    mockUseFetchData.mockReturnValue({ data: null, loading: true });
    renderLogs();
    expect(
      screen.getByRole("progressbar", { hidden: true }),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there are no logs", () => {
    mockUseFetchData.mockReturnValue({ data: [], loading: false });
    renderLogs();
    expect(
      screen.getByText("No activity logs found for the selected filters."),
    ).toBeInTheDocument();
  });

  it("renders log entries with description, user, and device info", () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          _id: "log1",
          description: "Updated employee record",
          username: "jdoe",
          timestamp: "2026-01-01T10:00:00Z",
          ipAddress: "10.0.0.1",
          userAgent: "",
        },
      ],
      loading: false,
    });
    renderLogs();
    expect(screen.getByText("Updated employee record")).toBeInTheDocument();
    expect(screen.getByText("jdoe")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
  });

  it("falls back to 'System' when a log has no username", () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          _id: "log1",
          description: "Auto job ran",
          timestamp: "2026-01-01T10:00:00Z",
        },
      ],
      loading: false,
    });
    renderLogs();
    expect(screen.getByText("System")).toBeInTheDocument();
  });

  it("shows an expand toggle only for logs with old/new values, and expands on click", () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          _id: "log1",
          description: "No diff",
          timestamp: "2026-01-01T10:00:00Z",
        },
        {
          _id: "log2",
          description: "Has diff",
          timestamp: "2026-01-01T10:00:00Z",
          oldValue: { status: "Pending" },
          newValue: { status: "Approved" },
        },
      ],
      loading: false,
    });
    renderLogs();
    expect(screen.getAllByLabelText("Expand details").length).toBe(1);

    fireEvent.click(screen.getByLabelText("Expand details"));
    expect(screen.getByLabelText("Collapse details")).toBeInTheDocument();
    expect(screen.getByText("Old Value")).toBeInTheDocument();
    expect(screen.getByText("New Value")).toBeInTheDocument();
  });

  it("filters via the Filter by User dropdown and clears back to defaults", async () => {
    mockUseFetchData.mockReturnValue({ data: [], loading: false });
    renderLogs();

    const userSelect = screen.getByRole("combobox", {
      name: "Filter by User",
      hidden: true,
    });
    fireEvent.mouseDown(userSelect);
    fireEvent.click(
      await screen.findByRole("option", { name: "jdoe", hidden: true }),
    );
    expect(userSelect).toHaveTextContent("jdoe");

    fireEvent.click(screen.getByLabelText("Clear all filters"));
    expect(userSelect).not.toHaveTextContent("jdoe");
  });

  it("does not fetch when the drawer is closed", () => {
    mockUseFetchData.mockReturnValue({ data: [], loading: false });
    renderLogs(false);
    expect(mockUseFetchData).toHaveBeenCalledWith(
      null,
      "get",
      expect.anything(),
      null,
      expect.any(String),
    );
  });
});
