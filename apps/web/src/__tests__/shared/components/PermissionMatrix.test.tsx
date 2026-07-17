import { render, screen, fireEvent } from "@testing-library/react";
import PermissionMatrix from "@web/shared/components/PermissionMatrix";

const STRUCTURE = {
  Employee: {
    actions: {
      view: ["self", "team", "all"],
      manage_salary: ["all", "-"],
    },
  },
};

function renderMatrix(overrides: Partial<any> = {}) {
  const isChecked = vi.fn().mockReturnValue(false);
  const onToggle = vi.fn();
  render(
    <PermissionMatrix
      activeModule="Employee"
      permissionStructure={STRUCTURE}
      isChecked={isChecked}
      onToggle={onToggle}
      {...overrides}
    />,
  );
  return { isChecked, onToggle };
}

describe("PermissionMatrix", () => {
  it("shows a fallback message when the module isn't in the structure", () => {
    render(
      <PermissionMatrix
        activeModule="Unknown"
        permissionStructure={STRUCTURE}
        isChecked={() => false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByText("Module structure not found")).toBeInTheDocument();
  });

  it("formats snake_case action names as Title Case rows", () => {
    renderMatrix();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Manage Salary")).toBeInTheDocument();
  });

  it("shows only the scope columns that are used by at least one action", () => {
    renderMatrix();
    // "self" and "team" only appear on "view"; "-"(Global) only on
    // "manage_salary" — all four should still show since each is used by
    // at least one action, but none of the actions include "team" is not
    // globally present twice; just confirm every used scope is present.
    expect(screen.getByText("Self")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Global")).toBeInTheDocument();
  });

  it("omits a scope column entirely when no action in the module uses it", () => {
    render(
      <PermissionMatrix
        activeModule="Employee"
        permissionStructure={{
          Employee: { actions: { view: ["self", "all"] } },
        }}
        isChecked={() => false}
        onToggle={vi.fn()}
      />,
    );
    expect(screen.queryByText("Team")).not.toBeInTheDocument();
    expect(screen.queryByText("Global")).not.toBeInTheDocument();
  });

  it("shows an em dash for a scope not valid for a given action, instead of a checkbox", () => {
    renderMatrix();
    const viewRow = screen.getByText("View").closest("tr")!;
    // "view" doesn't support the "-"(Global) scope.
    expect(viewRow.textContent).toContain("—");
  });

  it("reflects isChecked per module/action/scope and calls onToggle when clicked", () => {
    const isChecked = vi.fn(
      (module, action, scope) => action === "view" && scope === "self",
    );
    const onToggle = vi.fn();
    render(
      <PermissionMatrix
        activeModule="Employee"
        permissionStructure={STRUCTURE}
        isChecked={isChecked}
        onToggle={onToggle}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();

    fireEvent.click(checkboxes[1]);
    expect(onToggle).toHaveBeenCalledWith("Employee", "view", "team");
  });

  it("disables all checkboxes when disabled is true", () => {
    renderMatrix({ disabled: true });
    for (const cb of screen.getAllByRole("checkbox")) {
      expect(cb).toBeDisabled();
    }
  });
});
