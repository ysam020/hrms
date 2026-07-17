import { render, screen, fireEvent } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import { NodeCard } from "@web/features/layout/org-tree/NodeCard";
import type { Employee } from "@web/features/layout/org-tree/types";

const theme = createTheme();

function makeEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "e1",
    first_name: "Jane",
    last_name: "Doe",
    username: "jdoe",
    department: "Engineering",
    designation: "Senior Engineer",
    employeeStatus: "Active",
    employee_photo: "",
    ...overrides,
  };
}

describe("NodeCard", () => {
  it("shows the employee's name, initials, and designation", () => {
    render(
      <NodeCard
        employee={makeEmployee()}
        depth={1}
        theme={theme}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(screen.getByText(/Senior Engineer/)).toBeInTheDocument();
  });

  it("falls back to department when there is no designation", () => {
    render(
      <NodeCard
        employee={makeEmployee({ designation: "" })}
        depth={1}
        theme={theme}
        onClick={vi.fn()}
      />,
    );
    expect(screen.getByText(/Engineering/)).toBeInTheDocument();
  });

  it("calls onClick when the card is clicked", () => {
    const onClick = vi.fn();
    render(
      <NodeCard
        employee={makeEmployee()}
        depth={0}
        theme={theme}
        onClick={onClick}
      />,
    );
    fireEvent.click(screen.getByText("Jane Doe"));
    expect(onClick).toHaveBeenCalled();
  });
});
