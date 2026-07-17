import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Permissions from "@web/features/layout/permissions/Permissions";
import { ThemeContext } from "@web/app/providers/ThemeContext";

vi.mock("@web/features/layout/permissions/ManageRoles", () => ({
  default: () => <div>Stub ManageRoles</div>,
}));
vi.mock("@web/features/layout/permissions/UserPermissions", () => ({
  default: () => <div>Stub UserPermissions</div>,
}));
vi.mock("@web/features/layout/permissions/Teams", () => ({
  default: () => <div>Stub Teams</div>,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <Routes>
          <Route path="/permissions/*" element={<Permissions />} />
        </Routes>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

describe("Permissions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders Manage Roles for the manage-roles slug", async () => {
    renderAt("/permissions/manage-roles");
    expect(await screen.findByText("Stub ManageRoles")).toBeInTheDocument();
  });

  it("renders User Permissions for the user-permissions slug", async () => {
    renderAt("/permissions/user-permissions");
    expect(await screen.findByText("Stub UserPermissions")).toBeInTheDocument();
  });

  it("renders Teams for the teams slug", async () => {
    renderAt("/permissions/teams");
    expect(await screen.findByText("Stub Teams")).toBeInTheDocument();
  });

  it("redirects to the first tab when the path has no valid slug", async () => {
    renderAt("/permissions");
    expect(await screen.findByText("Stub ManageRoles")).toBeInTheDocument();
  });

  it("redirects to a previously saved tab from localStorage when the path is invalid", async () => {
    localStorage.setItem("permissions_tab_value", "teams");
    renderAt("/permissions/not-a-real-slug");
    expect(await screen.findByText("Stub Teams")).toBeInTheDocument();
  });

  it("switching tabs navigates and persists the chosen slug", async () => {
    renderAt("/permissions/manage-roles");
    await screen.findByText("Stub ManageRoles");

    fireEvent.click(screen.getByRole("tab", { name: "User Permissions" }));

    expect(await screen.findByText("Stub UserPermissions")).toBeInTheDocument();
    await waitFor(() =>
      expect(localStorage.getItem("permissions_tab_value")).toBe(
        "user-permissions",
      ),
    );
  });
});
