import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PayCyclesTab } from "@web/features/settings/payroll-components/PayCyclesTab";
import apiClient from "@web/core/http/axiosConfig";
import type { PayCycle } from "@web/features/settings/payroll-components/types";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function makeCycle(overrides: Partial<PayCycle> = {}): PayCycle {
  return {
    id: "cy1",
    name: "Factory Floor - Biweekly",
    frequency: "biweekly",
    payDay: 15,
    isDefault: false,
    ...overrides,
  };
}

function renderWith(
  cycles: PayCycle[],
  {
    canEdit = true,
    onRefetch = vi.fn().mockResolvedValue(undefined),
    setAlert = vi.fn(),
  } = {},
) {
  render(
    <PayCyclesTab
      cycles={cycles}
      canEdit={canEdit}
      onRefetch={onRefetch}
      setAlert={setAlert}
    />,
  );
  return { onRefetch, setAlert };
}

describe("PayCyclesTab", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows an info message when there are no additional pay cycles", () => {
    renderWith([]);
    expect(
      screen.getByText(
        "No additional pay cycles — every employee is paid monthly.",
      ),
    ).toBeInTheDocument();
  });

  it("shows a Default chip only for the default cycle", () => {
    renderWith([
      makeCycle({ id: "c1", name: "Standard", isDefault: true }),
      makeCycle({ id: "c2", name: "Contractors", isDefault: false }),
    ]);
    expect(screen.getAllByText("Default")).toHaveLength(1);
  });

  it("hides Add and row actions for a read-only user", () => {
    renderWith([makeCycle()], { canEdit: false });
    expect(screen.queryByText("Add pay cycle")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
  });

  it("disables Save until a name is entered", () => {
    renderWith([]);
    fireEvent.click(screen.getByText("Add pay cycle"));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Factory Floor - Biweekly"), {
      target: { value: "Contractors" },
    });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("creates a new pay cycle with the selected frequency and pay day", async () => {
    mockPost.mockResolvedValue({});
    const { setAlert, onRefetch } = renderWith([]);
    fireEvent.click(screen.getByText("Add pay cycle"));
    fireEvent.change(screen.getByPlaceholderText("Factory Floor - Biweekly"), {
      target: { value: "Contractors" },
    });

    fireEvent.mouseDown(screen.getAllByRole("combobox")[0]);
    fireEvent.click(await screen.findByRole("option", { name: "Weekly" }));

    fireEvent.change(screen.getByLabelText("Pay day"), {
      target: { value: "5" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
        name: "Contractors",
        frequency: "weekly",
        payDay: 5,
        isDefault: false,
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Pay cycle added.",
      }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("marks the cycle as default when the toggle is switched on", async () => {
    mockPost.mockResolvedValue({});
    renderWith([]);
    fireEvent.click(screen.getByText("Add pay cycle"));
    fireEvent.change(screen.getByPlaceholderText("Factory Floor - Biweekly"), {
      target: { value: "Contractors" },
    });
    fireEvent.click(screen.getByLabelText("Default cycle"));

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ isDefault: true }),
      ),
    );
  });

  it("pre-fills the dialog when editing an existing cycle", () => {
    renderWith([makeCycle({ name: "Contractors" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByText("Edit pay cycle")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Contractors")).toBeInTheDocument();
  });

  it("updates an existing pay cycle", async () => {
    mockPut.mockResolvedValue({});
    const { setAlert } = renderWith([makeCycle({ id: "c9" })]);
    fireEvent.click(screen.getByLabelText("Edit"));
    fireEvent.change(screen.getByLabelText("Pay day"), {
      target: { value: "20" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ payDay: 20 }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Pay cycle updated.",
      }),
    );
  });

  it("removes a pay cycle after confirmation", async () => {
    mockDelete.mockResolvedValue({});
    const { setAlert, onRefetch } = renderWith([
      makeCycle({ name: "Contractors" }),
    ]);
    fireEvent.click(screen.getByLabelText("Remove"));
    expect(
      screen.getByText('"Contractors" will no longer be assignable.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Confirm", { selector: "span" }));

    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        message: "Pay cycle removed.",
      }),
    );
    expect(onRefetch).toHaveBeenCalled();
  });

  it("shows the server error message when saving fails", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Name already used" } },
    });
    const { setAlert } = renderWith([]);
    fireEvent.click(screen.getByText("Add pay cycle"));
    fireEvent.change(screen.getByPlaceholderText("Factory Floor - Biweekly"), {
      target: { value: "Dup" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Name already used",
        }),
      ),
    );
  });
});
