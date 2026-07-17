import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PtSlabsTab } from "@web/features/settings/payroll-components/PtSlabsTab";
import apiClient from "@web/core/http/axiosConfig";
import type { PtSlab } from "@web/features/settings/payroll-components/types";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function makeSlab(overrides: Partial<PtSlab> = {}): PtSlab {
  return {
    id: "s1",
    state: "Karnataka",
    minGross: 15000,
    maxGross: 25000,
    monthlyPT: 200,
    ...overrides,
  };
}

function renderWith(
  slabs: PtSlab[],
  {
    canEdit = true,
    onRefetch = vi.fn().mockResolvedValue(undefined),
    setAlert = vi.fn(),
  } = {},
) {
  render(
    <PtSlabsTab
      slabs={slabs}
      canEdit={canEdit}
      onRefetch={onRefetch}
      setAlert={setAlert}
    />,
  );
  return { onRefetch, setAlert };
}

describe("PtSlabsTab", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows an info message when there are no state-wise slabs", () => {
    renderWith([]);
    expect(
      screen.getByText(
        "No state-wise slabs configured — Professional Tax uses a flat approximate slab for every employee.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the gross range, using ∞ when there is no upper bound", () => {
    renderWith([makeSlab({ maxGross: null })]);
    expect(screen.getByText("₹15000 – ∞")).toBeInTheDocument();
  });

  it("renders a bounded gross range", () => {
    renderWith([makeSlab({ minGross: 15000, maxGross: 25000 })]);
    expect(screen.getByText("₹15000 – ₹25000")).toBeInTheDocument();
  });

  it("hides Add and row actions for a read-only user", () => {
    renderWith([makeSlab()], { canEdit: false });
    expect(screen.queryByText("Add slab")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
  });

  it("disables Save until a state name is entered", () => {
    renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Karnataka"), {
      target: { value: "Maharashtra" },
    });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("creates a new slab, omitting maxGross from the payload when left at 0", async () => {
    mockPost.mockResolvedValue({});
    const { setAlert, onRefetch } = renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    fireEvent.change(screen.getByPlaceholderText("Karnataka"), {
      target: { value: "Maharashtra" },
    });
    fireEvent.change(screen.getByLabelText("Min gross"), {
      target: { value: "10000" },
    });
    fireEvent.change(screen.getByLabelText("Monthly PT"), {
      target: { value: "200" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        state: "Maharashtra",
        minGross: 10000,
        maxGross: undefined,
        monthlyPT: 200,
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success", message: "Slab added." }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("includes maxGross in the payload once a value is entered", async () => {
    mockPost.mockResolvedValue({});
    renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    fireEvent.change(screen.getByPlaceholderText("Karnataka"), {
      target: { value: "Maharashtra" },
    });
    fireEvent.change(screen.getByLabelText("Max gross"), {
      target: { value: "25000" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ maxGross: 25000 }),
      ),
    );
  });

  it("pre-fills the dialog when editing an existing slab", () => {
    renderWith([makeSlab({ state: "Karnataka" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByText("Edit PT slab")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Karnataka")).toBeInTheDocument();
  });

  it("updates an existing slab", async () => {
    mockPut.mockResolvedValue({});
    const { setAlert } = renderWith([makeSlab({ id: "s9" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(screen.getByLabelText("Monthly PT"), {
      target: { value: "300" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ monthlyPT: 300 }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Slab updated.",
      }),
    );
  });

  it("removes a slab after confirmation", async () => {
    mockDelete.mockResolvedValue({});
    const { setAlert, onRefetch } = renderWith([
      makeSlab({ state: "Karnataka" }),
    ]);
    fireEvent.click(screen.getByLabelText("Remove"));
    expect(
      screen.getByText("This Karnataka slab will no longer apply."),
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
      response: { data: { message: "State already configured" } },
    });
    const { setAlert } = renderWith([]);
    fireEvent.click(screen.getByText("Add slab"));
    fireEvent.change(screen.getByPlaceholderText("Karnataka"), {
      target: { value: "Karnataka" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "State already configured",
        }),
      ),
    );
  });
});
