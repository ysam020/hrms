import { render, screen, fireEvent } from "@testing-library/react";
import { SaveDialog } from "@web/features/settings/org-settings/SaveDialog";

function renderDialog(saving = false, onConfirm = vi.fn(), onCancel = vi.fn()) {
  render(
    <SaveDialog
      open={true}
      saving={saving}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, onCancel };
}

describe("SaveDialog", () => {
  it("defaults to 'Immediately' and confirms with roughly the current time", () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    const [effectiveFrom, note] = onConfirm.mock.calls[0];
    expect(Math.abs(effectiveFrom.getTime() - Date.now())).toBeLessThan(5000);
    expect(note).toBe("");
  });

  it("resolves 'Start of next month' to the 1st of next month", () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Start of next month/ }));
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    const now = new Date();
    const expected = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    expect(onConfirm.mock.calls[0][0]).toEqual(expected);
  });

  it("resolves 'Start of next year' to Jan 1st of next year", () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Start of next year/ }));
    fireEvent.click(screen.getByText("Save", { selector: "span" }));

    const expected = new Date(new Date().getFullYear() + 1, 0, 1);
    expect(onConfirm.mock.calls[0][0]).toEqual(expected);
  });

  it("disables Save for a custom date until one is chosen, then resolves it", () => {
    const { onConfirm } = renderDialog();
    fireEvent.click(screen.getByRole("radio", { name: /Custom date/ }));

    const saveBtn = screen
      .getByText("Save", { selector: "span" })
      .closest("button")!;
    expect(saveBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Effective date"), {
      target: { value: "2026-08-15" },
    });
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);
    expect(onConfirm.mock.calls[0][0]).toEqual(new Date("2026-08-15"));
  });

  it("includes the entered change note", () => {
    const { onConfirm } = renderDialog();
    fireEvent.change(screen.getByLabelText("Change note (optional)"), {
      target: { value: "Updated for FY26" },
    });
    fireEvent.click(screen.getByText("Save", { selector: "span" }));
    expect(onConfirm.mock.calls[0][1]).toBe("Updated for FY26");
  });

  it("disables Cancel while saving", () => {
    renderDialog(true);
    expect(
      screen.getByText("Cancel", { selector: "span" }).closest("button"),
    ).toBeDisabled();
  });
});
