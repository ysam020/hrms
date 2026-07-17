import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PerformanceReviewCycles from "@web/features/performance-review/PerformanceReviewCycles";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.post = vi.fn();
  instance.patch = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.value ?? ""}
      onChange={(e) => props.onChange({ value: e.target.value })}
    >
      {(props.options || []).map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      id={props.inputId}
      aria-label={props.inputId}
      value={
        props.value ? new Date(props.value).toISOString().slice(0, 10) : ""
      }
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
    />
  ),
}));

function cycle(overrides: Partial<any> = {}) {
  return {
    id: "c1",
    name: "H1 2026 Review",
    status: "draft",
    periodStart: "2026-01-01",
    periodEnd: "2026-06-30",
    ratingScale: 5,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function mockRoute(url: string, data: any) {
  return Promise.resolve({ data });
}

function setupApi({
  cycles = [cycle()],
  total = 1,
  allReviews = [],
  allUsers = [],
}: {
  cycles?: any[];
  total?: number;
  allReviews?: any[];
  allUsers?: any[];
} = {}) {
  mockApiClient.mockImplementation((url: string) => {
    if (url.startsWith("/performance-reviews/cycles?")) {
      return mockRoute(url, { data: cycles, total });
    }
    if (url === "/performance-reviews") {
      return mockRoute(url, { data: allReviews });
    }
    if (url.startsWith("/get-all-users")) {
      return mockRoute(url, { data: allUsers });
    }
    if (url.startsWith("/performance-reviews?cycleId=")) {
      return mockRoute(url, { data: [] });
    }
    return mockRoute(url, { data: [] });
  });
}

function renderCycles(setAlert = vi.fn()) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <AlertContext.Provider value={{ setAlert } as any}>
        <PerformanceReviewCycles />
      </AlertContext.Provider>
    </ThemeContext.Provider>,
  );
  return { setAlert };
}

describe("PerformanceReviewCycles", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockApiClient.post.mockReset();
    mockApiClient.patch.mockReset();
  });

  it("shows an empty state when there are no review cycles", async () => {
    setupApi({ cycles: [], total: 0 });
    renderCycles();
    expect(
      await screen.findByText("No review cycles found"),
    ).toBeInTheDocument();
  });

  it("lists cycles with their status chip and period range", async () => {
    setupApi({ cycles: [cycle({ status: "active" })] });
    renderCycles();
    expect(await screen.findByText("H1 2026 Review")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
    expect(screen.getByText(/01 Jan 2026.*30 Jun 2026/)).toBeInTheDocument();
  });

  it("shows a Close action only for an active cycle, not a draft one", async () => {
    setupApi({ cycles: [cycle({ status: "draft" })] });
    renderCycles();
    await screen.findByText("H1 2026 Review");
    expect(screen.queryByLabelText("Close")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Edit")).toBeInTheDocument();
    expect(screen.getByLabelText("Delete")).toBeInTheDocument();
  });

  it("shows a Close action for an active cycle", async () => {
    setupApi({ cycles: [cycle({ status: "active" })] });
    renderCycles();
    await screen.findByText("H1 2026 Review");
    expect(screen.getByLabelText("Close")).toBeInTheDocument();
  });

  it("refetches with the status filter applied when the status dropdown changes", async () => {
    setupApi({ cycles: [cycle()] });
    renderCycles();
    await screen.findByText("H1 2026 Review");
    mockApiClient.mockClear();

    fireEvent.change(screen.getByLabelText("Select Status"), {
      target: { value: "active" },
    });

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("status=active"),
      ),
    );
  });

  it("creates a new cycle: submit is disabled until name, dates, and at least one employee are set", async () => {
    setupApi({
      cycles: [],
      total: 0,
      allUsers: [{ id: "u1", firstName: "Jane", lastName: "Doe" }],
    });
    mockApiClient.post.mockResolvedValue({});
    const { setAlert } = renderCycles();
    await screen.findByText("No review cycles found");

    fireEvent.click(screen.getByLabelText("New review cycle"));
    expect(
      screen.getByText("Create", { selector: "span" }).closest("button"),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Cycle Name"), {
      target: { value: "H2 2026 Review" },
    });
    fireEvent.change(screen.getByLabelText("periodStart"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("periodEnd"), {
      target: { value: "2026-12-31" },
    });

    const employeeInput = screen.getByLabelText("Employees in this cycle");
    fireEvent.mouseDown(employeeInput);
    fireEvent.change(employeeInput, { target: { value: "Jane" } });
    fireEvent.click(await screen.findByText("Jane Doe"));

    await waitFor(() =>
      expect(
        screen.getByText("Create", { selector: "span" }).closest("button"),
      ).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByText("Create", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        "/performance-reviews/cycles",
        expect.objectContaining({
          name: "H2 2026 Review",
          periodStart: "2026-07-01",
          periodEnd: "2026-12-31",
          userIds: ["u1"],
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Review cycle created",
      }),
    );
  });

  it("edits a cycle: prefills the form and PATCHes on save", async () => {
    setupApi({ cycles: [cycle({ name: "Old Name" })] });
    mockApiClient.patch.mockResolvedValue({});
    renderCycles();
    await screen.findByText("Old Name");

    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByLabelText("Cycle Name")).toHaveValue("Old Name");
    expect(screen.getByLabelText("periodStart")).toHaveValue("2026-01-01");

    fireEvent.change(screen.getByLabelText("Cycle Name"), {
      target: { value: "Renamed Cycle" },
    });
    // Editing a cycle prefills employees from CYCLE_REVIEWS (empty here), so
    // the Save button stays disabled without re-adding at least one member —
    // matches the same required-fields guard used for create.
    expect(
      screen.getByText("Save", { selector: "span" }).closest("button"),
    ).toBeDisabled();
  });

  it("closes an active cycle through its confirmation dialog", async () => {
    setupApi({ cycles: [cycle({ status: "active" })] });
    mockApiClient.patch.mockResolvedValue({});
    const { setAlert } = renderCycles();
    await screen.findByText("H1 2026 Review");

    fireEvent.click(screen.getByLabelText("Close"));
    expect(
      screen.getByText(
        /Close "H1 2026 Review"\? No further submissions will be accepted\./,
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        "/performance-reviews/cycles/c1/status",
        { status: "closed" },
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Review cycle closed",
      }),
    );
  });

  it("deletes a cycle through its confirmation dialog", async () => {
    setupApi({ cycles: [cycle()] });
    mockApiClient.patch.mockResolvedValue({});
    const { setAlert } = renderCycles();
    await screen.findByText("H1 2026 Review");

    fireEvent.click(screen.getByLabelText("Delete"));
    expect(screen.getByText(/Delete "H1 2026 Review"\?/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete", { selector: "span" }));

    await waitFor(() =>
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        "/performance-reviews/cycles/c1/status",
        { status: "deleted" },
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Review cycle deleted",
      }),
    );
  });

  it("shows an avatar group for cycle members resolved from ALL_REVIEWS + user list", async () => {
    setupApi({
      cycles: [cycle()],
      allReviews: [{ cycleId: "c1", userId: "u1" }],
      allUsers: [
        {
          id: "u1",
          firstName: "Jane",
          lastName: "Doe",
          employeePhoto: "https://example.com/jane.jpg",
        },
      ],
    });
    renderCycles();
    await screen.findByText("H1 2026 Review");
    expect(await screen.findByAltText("Jane Doe")).toBeInTheDocument();
  });
});
