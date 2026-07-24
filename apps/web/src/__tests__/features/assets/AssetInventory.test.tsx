import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AssetInventory from "@web/features/assets/AssetInventory";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";
import useAssetCategoryOptions from "@web/features/assets/useAssetCategoryOptions";

const mocks = vi.hoisted(() => {
  const instance: any = vi.fn();
  instance.get = vi.fn();
  instance.post = vi.fn();
  instance.patch = vi.fn();
  return { instance };
});
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
};

vi.mock("@web/features/assets/useAssetCategoryOptions", () => ({
  default: vi.fn(),
}));
const mockUseAssetCategoryOptions =
  useAssetCategoryOptions as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/calendar", () => ({
  Calendar: (props: any) => (
    <input
      type="text"
      aria-label={props.placeholder}
      value={props.value ? props.value.toISOString().slice(0, 10) : ""}
      onChange={(e) =>
        props.onChange({
          value: e.target.value ? new Date(`${e.target.value}T00:00:00`) : null,
        })
      }
    />
  ),
}));

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

function makeAsset(overrides: Partial<any> = {}) {
  return {
    id: "a1",
    assetCode: "LPT-001",
    name: "MacBook Pro",
    category: "Laptop",
    status: "available",
    currentHolder: null,
    ...overrides,
  };
}

function renderWith(
  assets: any[],
  { user = { tenantRole: "employee" }, setAlert = vi.fn() } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: { assets }, total: assets.length },
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserContext.Provider value={{ user } as any}>
        <AssetInventory />
      </UserContext.Provider>
    </AlertContext.Provider>,
  );
}

const HR_USER = { tenantRole: "hr" };

describe("AssetInventory", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mocks.instance.get.mockReset();
    mocks.instance.post.mockReset();
    mocks.instance.patch.mockReset();
    mockUseAssetCategoryOptions.mockReturnValue({
      options: ["Laptop", "Monitor"],
      ensureAssetCategorySaved: vi.fn(),
    });
  });

  afterEach(() => {
    // Safety net: if a test throws/times out mid-fake-timer-usage, real
    // timers must still be restored or every later test in this file hangs.
    vi.useRealTimers();
  });

  it("shows an empty state when there are no assets", async () => {
    renderWith([]);
    expect(await screen.findByText("No assets found")).toBeInTheDocument();
  });

  it("renders the asset row with a status chip and 'assigned to' formatting", async () => {
    renderWith([
      makeAsset({
        currentHolder: {
          first_name: "Jane",
          last_name: "Doe",
          username: "jdoe",
        },
      }),
    ]);
    expect(await screen.findByText("LPT-001")).toBeInTheDocument();
    expect(screen.getByText("available")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows an em dash when an asset has no current holder", async () => {
    renderWith([makeAsset({ currentHolder: null })]);
    await screen.findByText("LPT-001");
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("hides Add Asset and row actions for a non-HR user", async () => {
    renderWith([makeAsset({ status: "available" })], {
      user: { tenantRole: "employee" },
    });
    await screen.findByText("LPT-001");
    expect(screen.queryByLabelText("Add asset")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Assign")).not.toBeInTheDocument();
  });

  it("shows Assign and Retire actions for an available asset (HR user)", async () => {
    renderWith([makeAsset({ status: "available" })], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.getByLabelText("Assign")).toBeInTheDocument();
    expect(screen.getByLabelText("Retire")).toBeInTheDocument();
    expect(screen.queryByLabelText("Return")).not.toBeInTheDocument();
  });

  it("shows only Return for an assigned asset", async () => {
    renderWith([makeAsset({ status: "assigned" })], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.getByLabelText("Return")).toBeInTheDocument();
    expect(screen.queryByLabelText("Assign")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Retire")).not.toBeInTheDocument();
  });

  it("shows Retire and Mark Available for a maintenance asset", async () => {
    renderWith([makeAsset({ status: "maintenance" })], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.getByLabelText("Retire")).toBeInTheDocument();
    expect(screen.getByLabelText("Mark Available")).toBeInTheDocument();
  });

  it("shows no row actions for a retired asset", async () => {
    renderWith([makeAsset({ status: "retired" })], { user: HR_USER });
    await screen.findByText("LPT-001");
    expect(screen.queryByLabelText("Assign")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Retire")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Return")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mark Available")).not.toBeInTheDocument();
  });

  it("creates a new asset, converting the purchase value to a number", async () => {
    mocks.instance.post.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([], { user: HR_USER, setAlert });
    await screen.findByText("No assets found");

    fireEvent.click(screen.getByLabelText("Add asset"));
    fireEvent.change(screen.getByLabelText("Asset Name"), {
      target: { value: "Dell Monitor" },
    });
    fireEvent.change(screen.getByLabelText("Asset Code"), {
      target: { value: "mon-002" },
    });
    fireEvent.change(screen.getByLabelText("Purchase Cost (₹)"), {
      target: { value: "15000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          name: "Dell Monitor",
          assetCode: "MON-002",
          purchaseValue: 15000,
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Asset created",
      }),
    );
  });

  it("disables Create until name and asset code are filled in", async () => {
    renderWith([], { user: HR_USER });
    await screen.findByText("No assets found");
    fireEvent.click(screen.getByLabelText("Add asset"));
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  });

  it("searches and assigns an employee to an available asset", async () => {
    mocks.instance.get.mockResolvedValue({
      data: { data: [{ id: "u1", username: "jdoe" }] },
    });
    mocks.instance.post.mockResolvedValue({});
    renderWith([makeAsset({ status: "available" })], { user: HR_USER });
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByLabelText("Assign"));
    expect(screen.getByText("Assign Asset LPT-001")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Employee"), {
      target: { value: "jd" },
    });

    fireEvent.click(await screen.findByText("jdoe", {}, { timeout: 2000 }));
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          assetId: "a1",
          userId: "u1",
          conditionOut: "good",
        }),
      ),
    );
  }, 10000);

  it("returns an assigned asset with the entered condition", async () => {
    mocks.instance.post.mockResolvedValue({});
    renderWith([makeAsset({ id: "a9", status: "assigned" })], {
      user: HR_USER,
    });
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByLabelText("Return"));
    expect(screen.getByText("Return Asset LPT-001")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return" }));

    await waitFor(() =>
      expect(mocks.instance.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ assetId: "a9", conditionIn: "good" }),
      ),
    );
  });

  it("retires an asset after confirmation", async () => {
    mocks.instance.post.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([makeAsset({ id: "a5", status: "available" })], {
      user: HR_USER,
      setAlert,
    });
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByLabelText("Retire"));
    expect(
      screen.getByText("Are you sure you want to retire asset LPT-001?"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retire", { selector: "span" }));

    await waitFor(() => expect(mocks.instance.post).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Asset retired",
      }),
    );
  });

  it("marks a maintenance asset available again", async () => {
    mocks.instance.patch.mockResolvedValue({});
    const setAlert = vi.fn();
    renderWith([makeAsset({ id: "a7", status: "maintenance" })], {
      user: HR_USER,
      setAlert,
    });
    await screen.findByText("LPT-001");

    fireEvent.click(screen.getByLabelText("Mark Available"));

    await waitFor(() =>
      expect(mocks.instance.patch).toHaveBeenCalledWith(expect.any(String), {
        status: "available",
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Asset marked available",
      }),
    );
  });
});
