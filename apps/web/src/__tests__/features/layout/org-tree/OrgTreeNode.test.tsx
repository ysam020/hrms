import { render, screen, fireEvent } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import { OrgTreeNode } from "@web/features/layout/org-tree/OrgTreeNode";
import type { Employee } from "@web/features/layout/org-tree/types";

const theme = createTheme();

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: overrides.username ?? "e1",
    first_name: "Jane",
    last_name: "Doe",
    username: "jdoe",
    department: "Engineering",
    designation: "Engineer",
    employeeStatus: "Active",
    employee_photo: "",
    ...overrides,
  };
}

describe("OrgTreeNode", () => {
  it("renders just the node card when there are no children", () => {
    const { container } = render(
      <OrgTreeNode
        employee={makeEmployee()}
        depth={0}
        theme={theme}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(container.querySelector("ul")).not.toBeInTheDocument();
  });

  it("recurses into a nested OrgTreeNode for a small team (<= threshold)", () => {
    const child = makeEmployee({
      username: "child1",
      first_name: "Al",
      last_name: "Smith",
    });
    render(
      <OrgTreeNode
        employee={makeEmployee({ children: [child] })}
        depth={1}
        theme={theme}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Al Smith")).toBeInTheDocument();
  });

  it("propagates onSelect from a deeply nested child", () => {
    const onSelect = vi.fn();
    const grandchild = makeEmployee({
      username: "gc",
      first_name: "Sam",
      last_name: "Lee",
    });
    const child = makeEmployee({
      username: "child1",
      first_name: "Al",
      last_name: "Smith",
      children: [grandchild],
    });
    render(
      <OrgTreeNode
        employee={makeEmployee({ children: [child] })}
        depth={0}
        theme={theme}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByText("Sam Lee"));
    expect(onSelect).toHaveBeenCalledWith(grandchild);
  });

  it("folds a large team (> threshold, at depth 1) into a RosterGrid instead of individual tree nodes", () => {
    const members = Array.from({ length: 9 }, (_, i) =>
      makeEmployee({
        username: `m${i}`,
        first_name: `Member`,
        last_name: `${i}`,
      }),
    );
    const { container } = render(
      <OrgTreeNode
        employee={makeEmployee({ children: members })}
        depth={1}
        theme={theme}
        onSelect={vi.fn()}
      />,
    );
    // RosterGrid renders members inside a single Paper grid, not as nested
    // OrgTreeNode/NodeCard trees — confirmed by absence of nested <ul>s.
    expect(screen.getByText("Member 0")).toBeInTheDocument();
    expect(screen.getByText("Member 8")).toBeInTheDocument();
    expect(container.querySelectorAll("ul ul").length).toBe(0);
  });

  it("keeps a team of exactly the threshold size as individual tree nodes", () => {
    const members = Array.from({ length: 8 }, (_, i) =>
      makeEmployee({
        username: `m${i}`,
        first_name: `Member`,
        last_name: `${i}`,
      }),
    );
    render(
      <OrgTreeNode
        employee={makeEmployee({ children: members })}
        depth={1}
        theme={theme}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/^Member/).length).toBe(8);
  });
});
