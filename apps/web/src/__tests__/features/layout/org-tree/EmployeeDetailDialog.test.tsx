import { render, screen, fireEvent } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import { EmployeeDetailDialog } from "@web/features/layout/org-tree/EmployeeDetailDialog";
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

describe("EmployeeDetailDialog", () => {
  it("renders nothing meaningful when there is no employee", () => {
    render(
      <EmployeeDetailDialog
        employee={null}
        isMobile={false}
        theme={theme}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByText("Department")).not.toBeInTheDocument();
  });

  it("shows the employee's name, department, and status when open", () => {
    render(
      <EmployeeDetailDialog
        employee={makeEmployee()}
        isMobile={false}
        theme={theme}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("falls back to an em dash when department is missing", () => {
    render(
      <EmployeeDetailDialog
        employee={makeEmployee({ department: "" })}
        isMobile={false}
        theme={theme}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("calls onClose from the header close button", () => {
    const onClose = vi.fn();
    render(
      <EmployeeDetailDialog
        employee={makeEmployee()}
        isMobile={false}
        theme={theme}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByLabelText("Close employee details"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose from the footer Close button", () => {
    const onClose = vi.fn();
    render(
      <EmployeeDetailDialog
        employee={makeEmployee()}
        isMobile={false}
        theme={theme}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("Close", { selector: "span" }));
    expect(onClose).toHaveBeenCalled();
  });
});
