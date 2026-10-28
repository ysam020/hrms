import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { UserContext } from "@web/app/providers/UserContext";
import { rememberReturnPath, takeReturnPath } from "@next/app/returnPath";

const get = vi.fn();
const post = vi.fn();
vi.mock("@next/lib/api", () => ({
  apiClient: {
    get: (...a: any[]) => get(...a),
    post: (...a: any[]) => post(...a),
  },
  errorMessage: (e: any) => e?.message ?? "error",
}));

import ConnectAuthorize from "@next/features/assistant/ConnectAuthorize";

const REQ = "a".repeat(43);
const details = {
  clientName: "Claude",
  clientUri: null,
  redirectHost: "claude.ai",
  organisation: "Acme",
  scopes: [
    { scope: "profile:read", description: "Your profile", defaultOn: true },
    { scope: "payroll:read", description: "Your salary", defaultOn: false },
  ],
};

function renderConsent() {
  return render(
    <UserContext.Provider
      value={{ user: { firstName: "Priya", lastName: "Sharma" } } as any}
    >
      <MemoryRouter initialEntries={[`/connect/authorize/${REQ}`]}>
        <Routes>
          <Route
            path="/connect/authorize/:requestId"
            element={<ConnectAuthorize />}
          />
        </Routes>
      </MemoryRouter>
    </UserContext.Provider>,
  );
}

describe("AI assistant consent screen", () => {
  const assign = vi.fn();
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    assign.mockReset();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign },
      writable: true,
    });
  });

  it("names the client, the person, the organisation and where it redirects", async () => {
    get.mockResolvedValue({ data: { data: details } });
    renderConsent();
    expect(
      await screen.findByRole("heading", {
        name: "Connect Claude to Praesto?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Priya Sharma")).toBeInTheDocument();
    expect(screen.getByText(/at Acme/)).toBeInTheDocument();
    expect(screen.getByText("claude.ai")).toBeInTheDocument();
  });

  it("leaves salary unticked by default and sends only the ticked scopes", async () => {
    get.mockResolvedValue({ data: { data: details } });
    post.mockResolvedValue({
      data: { data: { redirectTo: "https://claude.ai/cb?code=x" } },
    });
    const user = userEvent.setup();
    renderConsent();
    const salary = await screen.findByRole("checkbox", { name: "Your salary" });
    expect(salary).not.toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Your profile" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Allow" }));
    expect(post).toHaveBeenCalledWith(
      `/ai-connections/requests/${REQ}/approve`,
      { scopes: ["profile:read"] },
    );
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith("https://claude.ai/cb?code=x"),
    );
  });

  it("can't allow with nothing ticked", async () => {
    get.mockResolvedValue({ data: { data: details } });
    const user = userEvent.setup();
    renderConsent();
    await user.click(
      await screen.findByRole("checkbox", { name: "Your profile" }),
    );
    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled();
  });

  it("Don’t Allow declines and returns to the assistant", async () => {
    get.mockResolvedValue({ data: { data: details } });
    post.mockResolvedValue({
      data: {
        data: { redirectTo: "https://claude.ai/cb?error=access_denied" },
      },
    });
    const user = userEvent.setup();
    renderConsent();
    await user.click(
      await screen.findByRole("button", { name: "Don’t Allow" }),
    );
    expect(post).toHaveBeenCalledWith(`/ai-connections/requests/${REQ}/deny`);
    await waitFor(() => expect(assign).toHaveBeenCalled());
  });

  it("shows an expired request plainly", async () => {
    get.mockRejectedValue(new Error("This connection request has expired."));
    renderConsent();
    expect(await screen.findByText(/has expired/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
  });
});

describe("return path across Google sign-in", () => {
  it("round-trips an in-app path once", () => {
    rememberReturnPath(`/connect/authorize/${REQ}`);
    expect(takeReturnPath()).toBe(`/connect/authorize/${REQ}`);
    expect(takeReturnPath()).toBeNull();
  });

  it.each([
    "//evil.example/x",
    "https://evil.example",
    "/\\evil",
    "/",
    "",
    null,
  ])("never returns %j", (p) => {
    rememberReturnPath(p as any);
    expect(takeReturnPath()).toBeNull();
  });
});
