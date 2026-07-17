import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EmployeeManagement from "@web/features/employee-management/EmployeeManagement";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/features/employee-management/EmployeeList", () => ({
  default: () => <div>Stub EmployeeList</div>,
}));
vi.mock("@web/features/employee-management/EmployeeInsights", () => ({
  default: () => <div>Stub EmployeeInsights</div>,
}));

function renderWith(user: any) {
  return render(
    <MemoryRouter initialEntries={["/employee-management"]}>
      <UserContext.Provider value={{ user } as any}>
        <EmployeeManagement />
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("EmployeeManagement", () => {
  it("hides the Insights tab for a regular employee", () => {
    renderWith({ tenantRole: "employee" });
    expect(
      screen.getByRole("tab", { name: "Employee List" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Insights" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Insights tab for HR and above", () => {
    renderWith({ tenantRole: "hr" });
    expect(screen.getByRole("tab", { name: "Insights" })).toBeInTheDocument();
  });
});
