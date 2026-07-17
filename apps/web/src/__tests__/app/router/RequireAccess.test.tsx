import { render, screen, waitFor } from "@testing-library/react";
import RequireAccess from "@web/app/router/RequireAccess";
import { UserContext } from "@web/app/providers/UserContext";

vi.mock("@web/app/router/UnAuthorisedRoute", () => ({
  default: () => <div data-testid="unauthorised">Unauthorised</div>,
}));

function renderWithUser(user: any, check: (user: any) => boolean) {
  return render(
    <UserContext.Provider
      value={{ user, setUser: vi.fn(), handleLogout: vi.fn() }}
    >
      <RequireAccess check={check}>
        <div data-testid="protected">Protected content</div>
      </RequireAccess>
    </UserContext.Provider>,
  );
}

describe("RequireAccess", () => {
  it("renders children when check(user) returns true", () => {
    renderWithUser({ tenantRole: "owner" }, (u) => u.tenantRole === "owner");
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });

  it("renders UnAuthorisedRoute when check(user) returns false", async () => {
    renderWithUser({ tenantRole: "member" }, (u) => u.tenantRole === "owner");
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("unauthorised")).toBeInTheDocument(),
    );
  });

  it("passes the current user from context into the check function", () => {
    const check = vi.fn().mockReturnValue(true);
    renderWithUser({ tenantRole: "hr", userId: "u1" }, check);
    expect(check).toHaveBeenCalledWith({ tenantRole: "hr", userId: "u1" });
  });

  it("re-evaluates and switches from unauthorised to authorised when the user in context changes", async () => {
    const check = (u: any) => u?.tenantRole === "owner";
    const { rerender } = render(
      <UserContext.Provider
        value={{
          user: { tenantRole: "member" },
          setUser: vi.fn(),
          handleLogout: vi.fn(),
        }}
      >
        <RequireAccess check={check}>
          <div data-testid="protected">Protected content</div>
        </RequireAccess>
      </UserContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("unauthorised")).toBeInTheDocument(),
    );

    rerender(
      <UserContext.Provider
        value={{
          user: { tenantRole: "owner" },
          setUser: vi.fn(),
          handleLogout: vi.fn(),
        }}
      >
        <RequireAccess check={check}>
          <div data-testid="protected">Protected content</div>
        </RequireAccess>
      </UserContext.Provider>,
    );

    expect(screen.getByTestId("protected")).toBeInTheDocument();
    expect(screen.queryByTestId("unauthorised")).not.toBeInTheDocument();
  });
});
