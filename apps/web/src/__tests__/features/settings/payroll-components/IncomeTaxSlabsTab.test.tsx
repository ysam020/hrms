import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IncomeTaxSlabsTab } from "@web/features/settings/payroll-components/IncomeTaxSlabsTab";
import apiClient from "@web/core/http/axiosConfig";
import type { IncomeTaxSlab } from "@web/features/settings/payroll-components/types";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function makeSlab(overrides: Partial<IncomeTaxSlab> = {}): IncomeTaxSlab {
  return {
    id: "t1",
    financialYear: "2025-26",
    regime: "new",
    minIncome: 300000,
    maxIncome: 600000,
    ratePercent: 5,
    ...overrides,
  };
}

function renderWith(
  taxSlabs: IncomeTaxSlab[],
  {
    canEdit = true,
    onRefetch = vi.fn().mockResolvedValue(undefined),
    setAlert = vi.fn(),
  } = {},
) {
  render(
    <IncomeTaxSlabsTab
      taxSlabs={taxSlabs}
      canEdit={canEdit}
      onRefetch={onRefetch}
      setAlert={setAlert}
    />,
  );
  return { onRefetch, setAlert };
}

describe("IncomeTaxSlabsTab", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows the FY2025-26 fallback notice when no slabs are configured", () => {
    renderWith([]);
    expect(
      screen.getByText(
        "No Income Tax slabs configured — TDS uses the FY2025-26 fallback slabs for both regimes.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the regime chip and income range for a slab", () => {
    renderWith([makeSlab({ regime: "new" })]);
    expect(screen.getByText("New Regime")).toBeInTheDocument();
    expect(screen.getByText("₹300000 – ₹600000")).toBeInTheDocument();
    expect(screen.getByText("5%")).toBeInTheDocument();
  });

  it("shows the Old Regime label and ∞ for an unbounded top slab", () => {
    renderWith([makeSlab({ regime: "old", maxIncome: null })]);
    expect(screen.getByText("Old Regime")).toBeInTheDocument();
    expect(screen.getByText("₹300000 – ∞")).toBeInTheDocument();
  });

  it("hides Add and row actions for a read-only user", () => {
    renderWith([makeSlab()], { canEdit: false });
    expect(screen.queryByText("Add slab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
  });

  it("disables Save until the financial year is entered", () => {
    renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    fireEvent.change(screen.getByPlaceholderText("2025-26"), {
      target: { value: "" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("2025-26"), {
      target: { value: "2026-27" },
    });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("defaults a new slab's financial year to the current FY and regime to New", () => {
    renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    function currentFinancialYear(): string {
      const now = new Date();
      const startYear =
        now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
    }
    expect(
      screen.getByDisplayValue(currentFinancialYear()),
    ).toBeInTheDocument();
  });

  it("creates a new tax slab with the selected regime and rate", async () => {
    mockPost.mockResolvedValue({});
    const { setAlert, onRefetch } = renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    fireEvent.change(screen.getByPlaceholderText("2025-26"), {
      target: { value: "2026-27" },
    });

    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Old Regime" }));

    fireEvent.change(screen.getByLabelText("Min income"), {
      target: { value: "300000" },
    });
    fireEvent.change(screen.getByLabelText("Max income"), {
      target: { value: "600000" },
    });
    fireEvent.change(screen.getByLabelText("Rate"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        financialYear: "2026-27",
        regime: "old",
        minIncome: 300000,
        maxIncome: 600000,
        ratePercent: 5,
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Slab added." }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("omits maxIncome from the payload for the top (unbounded) slab", async () => {
    mockPost.mockResolvedValue({});
    renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    fireEvent.change(screen.getByPlaceholderText("2025-26"), {
      target: { value: "2026-27" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxIncome: undefined }),
      ),
    );
  });

  it("pre-fills the dialog when editing an existing slab", () => {
    renderWith([makeSlab({ financialYear: "2025-26" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByText("Edit Income Tax slab")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2025-26")).toBeInTheDocument();
  });

  it("updates an existing tax slab", async () => {
    mockPut.mockResolvedValue({});
    const { setAlert } = renderWith([makeSlab({ id: "t9" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(screen.getByLabelText("Rate"), {
      target: { value: "10" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ratePercent: 10 }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Slab updated.",
      }),
    );
  });

  it("removes a tax slab after confirmation, with regime named in the prompt", async () => {
    mockDelete.mockResolvedValue({});
    const { setAlert, onRefetch } = renderWith([
      makeSlab({ financialYear: "2025-26", regime: "new" }),
    ]);
    fireEvent.click(screen.getByLabelText("Remove"));
    expect(
      screen.getByText("This 2025-26 New Regime slab will no longer apply."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirm", { selector: "span" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "info", message: "Slab removed." }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("shows the server error message when saving fails", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Overlapping slab" } },
    });
    const { setAlert } = renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    fireEvent.change(screen.getByPlaceholderText("2025-26"), {
      target: { value: "2026-27" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Overlapping slab",
        }),
      ),
    );
  });
});
