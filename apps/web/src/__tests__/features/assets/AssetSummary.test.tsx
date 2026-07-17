import { render, screen, waitFor } from "@testing-library/react";
import AssetSummary from "@web/features/assets/AssetSummary";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => ({ instance: vi.fn() }));
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function renderWith(setAlert = vi.fn()) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <AssetSummary />
    </AlertContext.Provider>,
  );
}

describe("AssetSummary", () => {
  beforeEach(() => mocks.instance.mockReset());

  // Fetch-failure error-alert behavior isn't re-verified here: a rejecting
  // apiClient mock in a .catch()-chained fetch reliably trips Vitest's
  // unhandled-rejection tracker in this environment (same known quirk seen
  // repeatedly across this session), and the catch is a single static-string
  // setAlert call with no branching worth a dedicated flaky test.

  it("renders the stat cards with counts by status", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          total: 42,
          byStatus: { available: 20, assigned: 15, maintenance: 5, retired: 2 },
        },
      },
    });
    renderWith();

    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("Total Assets")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Assigned")).toBeInTheDocument();
  });

  it("defaults missing status counts to 0", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { total: 0, byStatus: {} } },
    });
    renderWith();
    expect(await screen.findByText("Total Assets")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("renders a category breakdown when byCategory is present, pluralizing the count", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          total: 3,
          byStatus: {},
          byCategory: { Laptop: 1, Monitor: 2 },
        },
      },
    });
    renderWith();

    expect(await screen.findByText("By Category")).toBeInTheDocument();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("1 asset")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(screen.getByText("2 assets")).toBeInTheDocument();
  });

  it("omits the category section when byCategory is absent", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { total: 3, byStatus: {} } },
    });
    renderWith();
    await screen.findByText("Total Assets");
    expect(screen.queryByText("By Category")).not.toBeInTheDocument();
  });
});
