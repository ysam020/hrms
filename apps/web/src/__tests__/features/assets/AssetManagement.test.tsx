import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AssetManagement from "@web/features/assets/AssetManagement";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/features/assets/AssetInventory", () => ({
  default: () => <div>Stub Inventory</div>,
}));
vi.mock("@web/features/assets/AssetIssues", () => ({
  default: () => <div>Stub Issues</div>,
}));
vi.mock("@web/features/assets/AssetSummary", () => ({
  default: () => <div>Stub Summary</div>,
}));

function renderWith(user: any) {
  return render(
    <MemoryRouter initialEntries={["/assets"]}>
      <UserContext.Provider value={{ user } as any}>
        <AssetManagement />
      </UserContext.Provider>
    </MemoryRouter>,
  );
}

describe("AssetManagement", () => {
  it("shows Inventory and Issues tabs, but not Summary, for a regular employee", () => {
    renderWith({ tenantRole: "employee", permissions: [] });
    expect(screen.getByRole("tab", { name: "Inventory" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Issues" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Summary" }),
    ).not.toBeInTheDocument();
  });

  it("shows the Summary tab for HR/admin users", () => {
    renderWith({ tenantRole: "hr" });
    expect(screen.getByRole("tab", { name: "Summary" })).toBeInTheDocument();
  });

  it("shows the Summary tab for a user with the explicit Assets:manage permission grant", () => {
    renderWith({ tenantRole: "employee", permissions: ["Assets:manage"] });
    expect(screen.getByRole("tab", { name: "Summary" })).toBeInTheDocument();
  });

  it("renders the Inventory tab's content by default", () => {
    renderWith({ tenantRole: "hr" });
    expect(screen.getByText("Stub Inventory")).toBeInTheDocument();
  });
});
