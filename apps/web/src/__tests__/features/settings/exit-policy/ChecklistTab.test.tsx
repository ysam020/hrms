import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ChecklistTab } from "@web/features/settings/exit-policy/ChecklistTab";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function item(overrides: Partial<any> = {}) {
  return {
    id: "c1",
    label: "Return laptop",
    owningRole: "IT",
    isRequired: true,
    order: 0,
    ...overrides,
  };
}

async function chooseOption(combobox: HTMLElement, optionText: string) {
  fireEvent.mouseDown(combobox);
  fireEvent.click(await screen.findByRole("option", { name: optionText }));
}

function renderTab(
  checklistDefs: any[],
  canEdit = true,
  onRefetch = vi.fn(),
  setAlert = vi.fn(),
) {
  render(
    <ChecklistTab
      checklistDefs={checklistDefs}
      canEdit={canEdit}
      onRefetch={onRefetch}
      setAlert={setAlert}
    />,
  );
  return { onRefetch, setAlert };
}

describe("ChecklistTab", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockPut.mockReset();
    mockDelete.mockReset();
  });

  it("shows an info message about the default fallback checklist when empty", () => {
    renderTab([]);
    expect(
      screen.getByText(/falls back to the two simple/),
    ).toBeInTheDocument();
  });

  it("sorts items by their order field", () => {
    renderTab([
      item({ id: "c2", label: "Second", order: 1 }),
      item({ id: "c1", label: "First", order: 0 }),
    ]);
    const rows = screen.getAllByText(/First|Second/);
    expect(rows[0]).toHaveTextContent("First");
    expect(rows[1]).toHaveTextContent("Second");
  });

  it("shows Yes/No for the Required column", () => {
    renderTab([
      item({ id: "c1", label: "Required item", isRequired: true }),
      item({ id: "c2", label: "Optional item", isRequired: false }),
    ]);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("No")).toBeInTheDocument();
  });

  it("hides Add/Edit/Remove for a read-only user", () => {
    renderTab([item()], false);
    expect(
      screen.queryByText("Add item", { selector: "span" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Remove")).not.toBeInTheDocument();
  });

  it("defaults a new item's order to the end of the current list", async () => {
    mockPost.mockResolvedValue({});
    renderTab([item({ id: "c1", order: 0 }), item({ id: "c2", order: 1 })]);

    fireEvent.click(screen.getByText("Add item", { selector: "span" }));
    fireEvent.change(screen.getByLabelText("Item"), {
      target: { value: "Return badge" },
    });
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/exit-checklist-item-defs",
        expect.objectContaining({ label: "Return badge", order: 2 }),
      ),
    );
  });

  it("disables Save until a label is entered", () => {
    renderTab([]);
    fireEvent.click(screen.getByText("Add item", { selector: "span" }));
    expect(
      screen.getByText("Save", { selector: "span" }).closest("button"),
    ).toBeDisabled();
  });

  it("creates an item with the selected owning role and required flag", async () => {
    mockPost.mockResolvedValue({});
    renderTab([]);

    fireEvent.click(screen.getByText("Add item", { selector: "span" }));
    fireEvent.change(screen.getByLabelText("Item"), {
      target: { value: "Return badge" },
    });
    await chooseOption(screen.getByRole("combobox"), "Finance");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        "/exit-checklist-item-defs",
        expect.objectContaining({ owningRole: "Finance", isRequired: false }),
      ),
    );
  });

  it("edits an existing item, prefilling its values, and PUTs the update", async () => {
    mockPut.mockResolvedValue({});
    renderTab([item({ id: "c1", label: "Return laptop" })]);

    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByLabelText("Item")).toHaveValue("Return laptop");

    fireEvent.change(screen.getByLabelText("Item"), {
      target: { value: "Return laptop + charger" },
    });
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        "/exit-checklist-item-defs/c1",
        expect.objectContaining({ label: "Return laptop + charger" }),
      ),
    );
  });

  it("removes an item through the confirmation dialog", async () => {
    mockDelete.mockResolvedValue({});
    const { setAlert } = renderTab([
      item({ id: "c1", label: "Return laptop" }),
    ]);

    fireEvent.click(screen.getByLabelText("Remove"));
    expect(
      screen.getByText(/"Return laptop" will no longer appear/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Confirm", { selector: "span" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith("/exit-checklist-item-defs/c1"),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "info", message: "Item removed." }),
    );
  });
});
