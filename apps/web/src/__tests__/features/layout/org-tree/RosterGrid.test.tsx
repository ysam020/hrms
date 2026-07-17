import { render, screen, fireEvent } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import { RosterGrid } from "@web/features/layout/org-tree/RosterGrid";
import type { Employee } from "@web/features/layout/org-tree/types";

const theme = createTheme();

function makeMember(overrides: Partial<Employee> = {}): Employee {
  return {
    id: "e1",
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

describe("RosterGrid", () => {
  it("renders each member's name", () => {
    render(
      <RosterGrid
        members={[
          makeMember(),
          makeMember({
            username: "asmith",
            first_name: "Al",
            last_name: "Smith",
          }),
        ]}
        theme={theme}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Al Smith")).toBeInTheDocument();
  });

  it("calls onSelect with the clicked member", () => {
    const onSelect = vi.fn();
    const member = makeMember();
    render(<RosterGrid members={[member]} theme={theme} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Jane Doe"));
    expect(onSelect).toHaveBeenCalledWith(member);
  });
});
