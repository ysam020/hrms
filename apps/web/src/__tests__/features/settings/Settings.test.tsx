import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import Settings from "@web/features/settings/Settings";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/features/company-info/CompanyInfo", () => ({
  default: () => <div>Stub CompanyInfo</div>,
}));
vi.mock("@web/features/settings/OrgSettings", () => ({
  default: () => <div>Stub OrgSettings</div>,
}));
vi.mock("@web/features/subscription/Subscription", () => ({
  default: () => <div>Stub Subscription</div>,
}));
vi.mock("@web/features/settings/JoinRequests", () => ({
  default: () => <div>Stub JoinRequests</div>,
}));

function renderSettings(user: any, path = "/settings") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <UserContext.Provider value={{ user } as any}>
          <Routes>
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </UserContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

describe("Settings", () => {
  beforeEach(() => localStorage.clear());

  it("shows only Company Info and Organisation Settings for a regular employee", () => {
    renderSettings({
      isSuperUser: false,
      tenantRole: "employee",
      permissions: [],
    });
    expect(
      screen.getByRole("tab", { name: "Company Info" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Organisation Settings" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Join Requests" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: "Subscription" }),
    ).not.toBeInTheDocument();
  });

  it("shows Join Requests for an owner/admin", () => {
    renderSettings({ tenantRole: "admin" });
    expect(
      screen.getByRole("tab", { name: "Join Requests" }),
    ).toBeInTheDocument();
  });

  it("shows Join Requests for a user with the explicit approve permission, even without an admin role", () => {
    renderSettings({
      tenantRole: "employee",
      permissions: ["Organisation:approve_join_requests"],
    });
    expect(
      screen.getByRole("tab", { name: "Join Requests" }),
    ).toBeInTheDocument();
  });

  it("shows Subscription only when the user has subscription access", () => {
    renderSettings({ isSuperUser: true, tenantRole: "owner" });
    expect(
      screen.getByRole("tab", { name: "Subscription" }),
    ).toBeInTheDocument();
  });

  it("shows Company Info content by default", () => {
    renderSettings({ isSuperUser: true });
    expect(screen.getByText("Stub CompanyInfo")).toBeInTheDocument();
  });

  it("shows the tab matching the ?tab= query param", () => {
    renderSettings({ isSuperUser: true }, "/settings?tab=org-settings");
    expect(screen.getByText("Stub OrgSettings")).toBeInTheDocument();
  });

  it("falls back to the saved localStorage tab when there is no query param", () => {
    localStorage.setItem("settings_tab", "org-settings");
    renderSettings({ isSuperUser: true }, "/settings");
    expect(screen.getByText("Stub OrgSettings")).toBeInTheDocument();
  });

  it("switches tabs on click, updates the URL, and persists the slug to localStorage", () => {
    renderSettings({ isSuperUser: true });
    fireEvent.click(screen.getByRole("tab", { name: "Organisation Settings" }));

    expect(screen.getByText("Stub OrgSettings")).toBeInTheDocument();
    expect(localStorage.getItem("settings_tab")).toBe("org-settings");
  });

  it("navigates back to the bare /settings path when switching to Company Info", () => {
    renderSettings({ isSuperUser: true }, "/settings?tab=org-settings");
    fireEvent.click(screen.getByRole("tab", { name: "Company Info" }));
    expect(screen.getByText("Stub CompanyInfo")).toBeInTheDocument();
    expect(localStorage.getItem("settings_tab")).toBe("company-info");
  });
});
