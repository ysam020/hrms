import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SalaryComponentsTab } from "@web/features/settings/payroll-components/SalaryComponentsTab";
import apiClient from "@web/core/http/axiosConfig";
import type { SalaryComponent } from "@web/features/settings/payroll-components/types";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function makeComponent(
  overrides: Partial<SalaryComponent> = {},
): SalaryComponent {
  return {
    id: "c1",
    name: "Special Allowance",
    code: "SPECIAL_ALLOWANCE",
    type: "earning",
    isTaxable: true,
    calcType: "fixed",
    percentValue: null,
    isStatutory: false,
    isRecurring: true,
    displayOrder: 0,
    ...overrides,
  };
}

function renderWith(
  components: SalaryComponent[],
  {
    canEdit = true,
    onRefetch = vi.fn().mockResolvedValue(undefined),
    setAlert = vi.fn(),
  } = {},
) {
  render(
    <SalaryComponentsTab
      components={components}
      canEdit={canEdit}
      onRefetch={onRefetch}
      setAlert={setAlert}
    />,
  );
  return { onRefetch, setAlert };
}

describe("SalaryComponentsTab", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows an info message when there are no custom components", () => {
    renderWith([]);
    expect(
      screen.getByText(
        "No custom components yet — every payslip uses the standard 7 fields.",
      ),
    ).toBeInTheDocument();
  });

  it("renders a component row with a Statutory badge for statutory components", () => {
    renderWith([makeComponent({ isStatutory: true, name: "PF" })]);
    expect(screen.getByText("PF")).toBeInTheDocument();
    expect(screen.getByText("Statutory")).toBeInTheDocument();
  });

  it("shows the percent-of-basic calculation for percentage components", () => {
    renderWith([
      makeComponent({ calcType: "percent_of_basic", percentValue: 12 }),
    ]);
    expect(screen.getByText("12% of basic")).toBeInTheDocument();
  });

  it("hides the Add button and row actions for a read-only user", () => {
    renderWith([makeComponent()], { canEdit: false });
    expect(screen.queryByText("Add component")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
  });

  it("does not offer Remove for a statutory component, but does for a custom one", () => {
    renderWith([
      makeComponent({ id: "c1", isStatutory: true, name: "PF" }),
      makeComponent({ id: "c2", isStatutory: false, name: "Bonus" }),
    ]);
    expect(screen.getAllByLabelText("Remove")).toHaveLength(1);
  });

  it("disables Save until name and code are filled in", () => {
    renderWith([]);
    fireEvent.click(screen.getByText("Add component"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Special Allowance"), {
      target: { value: "Bonus" },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("SPECIAL_ALLOWANCE"), {
      target: { value: "bonus" },
    });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("uppercases the code as it's typed", () => {
    renderWith([]);
    fireEvent.click(screen.getByText("Add component"));
    fireEvent.change(screen.getByPlaceholderText("SPECIAL_ALLOWANCE"), {
      target: { value: "bonus" },
    });
    expect(screen.getByPlaceholderText("SPECIAL_ALLOWANCE")).toHaveValue(
      "BONUS",
    );
  });

  it("creates a new component and shows a success alert", async () => {
    mockPost.mockResolvedValue({});
    const { onRefetch, setAlert } = renderWith([]);
    fireEvent.click(screen.getByText("Add component"));
    fireEvent.change(screen.getByPlaceholderText("Special Allowance"), {
      target: { value: "Bonus" },
    });
    fireEvent.change(screen.getByPlaceholderText("SPECIAL_ALLOWANCE"), {
      target: { value: "BONUS" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          name: "Bonus",
          code: "BONUS",
          type: "earning",
        }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Component added.",
      }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("pre-fills the dialog when editing an existing component", () => {
    renderWith([makeComponent({ name: "Bonus", code: "BONUS" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByDisplayValue("Bonus")).toBeInTheDocument();
    expect(screen.getByDisplayValue("BONUS")).toBeInTheDocument();
    expect(screen.getByText("Edit component")).toBeInTheDocument();
  });

  it("updates an existing component via the edit dialog", async () => {
    mockPut.mockResolvedValue({});
    const { setAlert } = renderWith([makeComponent({ id: "c9" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(screen.getByDisplayValue("Special Allowance"), {
      target: { value: "Updated Allowance" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ name: "Updated Allowance" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Component updated.",
      }),
    );
  });

  it("removes a non-statutory component after confirmation", async () => {
    mockDelete.mockResolvedValue({});
    const { setAlert, onRefetch } = renderWith([
      makeComponent({ id: "c5", name: "Bonus" }),
    ]);
    fireEvent.click(screen.getByLabelText("Remove"));
    expect(
      screen.getByText('"Bonus" will no longer appear on new payslips.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirm", { selector: "span" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        message: "Component removed.",
      }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("shows the server error message when saving fails", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Code already exists" } },
    });
    const { setAlert } = renderWith([]);
    fireEvent.click(screen.getByText("Add component"));
    fireEvent.change(screen.getByPlaceholderText("Special Allowance"), {
      target: { value: "Bonus" },
    });
    fireEvent.change(screen.getByPlaceholderText("SPECIAL_ALLOWANCE"), {
      target: { value: "BONUS" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Code already exists",
        }),
      ),
    );
  });
});
