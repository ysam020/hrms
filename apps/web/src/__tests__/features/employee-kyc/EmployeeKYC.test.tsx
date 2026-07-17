import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import EmployeeKYC from "@web/features/employee-kyc/EmployeeKYC";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/features/employee-kyc/CompleteKYC", () => ({
  default: () => <div>Stub CompleteKYC</div>,
}));
vi.mock("@web/features/employee-kyc/ViewKycList", () => ({
  default: () => <div>Stub ViewKycList</div>,
}));
vi.mock("@web/features/employee-kyc/Insights", () => ({
  default: () => <div>Stub Insights</div>,
}));

function renderWith(user: any) {
  return render(
    <MemoryRouter initialEntries={["/kyc"]}>
      <UserContext.Provider value={{ user } as any}>
        <EmployeeKYC />
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("EmployeeKYC", () => {
  it("shows the View and Complete tabs, but not Insights, for a regular employee", () => {
    renderWith({ tenantRole: "employee" });
    expect(
      screen.getByRole("tab", { name: "View Employee KYCs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Complete KYC" }),
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
