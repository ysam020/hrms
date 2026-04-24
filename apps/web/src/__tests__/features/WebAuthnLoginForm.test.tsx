import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("primereact/inputtext", () => ({
  InputText: React.forwardRef(
    ({ name, value, onChange, disabled }: any, ref: any) => (
      <input
        ref={ref}
        data-testid="username-input"
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    ),
  ),
}));

vi.mock("@web/shared/components/LocationConsentDrawer", () => ({
  default: ({ showConsentDrawer, onAllowLocation, onDenyLocation }: any) =>
    showConsentDrawer ? (
      <div data-testid="location-drawer">
        <button onClick={() => onAllowLocation({ latitude: 1, longitude: 2 })}>
          Allow
        </button>
        <button onClick={() => onDenyLocation()}>Deny</button>
      </div>
    ) : null,
}));

vi.mock("@web/shared/utils/faviconUtils", () => ({
  updateFaviconWithDot: vi.fn(),
  updateDocumentTitle: vi.fn(),
}));

vi.mock("@web/core/webauthn", () => ({
  performWebAuthnLogin: vi
    .fn()
    .mockResolvedValue({ success: true, accessToken: "tok" }),
}));

const mockPost = vi.fn();
const mockApiClient = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: Object.assign((...a: any[]) => mockApiClient(...a), {
    post: (...args: any[]) => mockPost(...args),
    get: vi.fn().mockResolvedValue({ data: [] }),
  }),
  setAccessToken: vi.fn(),
}));

// ── Test helpers ─────────────────────────────────────────────────────────────

const mockSetUser = vi.fn();
const mockSetAlert = vi.fn();
const mockSetUsername = vi.fn();

import WebAuthnLoginForm from "@web/features/auth/WebAuthnLoginForm";

const renderLoginForm = (username = "") =>
  render(
    <MemoryRouter future={routerFuture}>
      <UserContext.Provider value={{ user: null, setUser: mockSetUser } as any}>
        <AlertContext.Provider
          value={{
            alert: { open: false, message: "", severity: "info" },
            setAlert: mockSetAlert,
          }}
        >
          <WebAuthnLoginForm
            username={username}
            setUsername={mockSetUsername}
          />
        </AlertContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>,
  );

describe("WebAuthnLoginForm – rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the username input", () => {
    renderLoginForm();
    expect(screen.getByTestId("username-input")).toBeInTheDocument();
  });

  it("renders the submit button", () => {
    renderLoginForm();
    expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
  });

  it("pre-fills the username input from the prop", () => {
    renderLoginForm("testuser");
    expect(screen.getByTestId("username-input")).toHaveValue("testuser");
  });

  it("does not show the location consent drawer initially", () => {
    renderLoginForm();
    expect(screen.queryByTestId("location-drawer")).not.toBeInTheDocument();
  });
});

describe("WebAuthnLoginForm – form submission errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an error alert when the API call throws", async () => {
    mockPost.mockRejectedValue(
      Object.assign(new Error("Network error"), {
        response: { data: { message: "Server down" } },
      }),
    );

    renderLoginForm("validuser");
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "error", open: true }),
      ),
    );
  });

  it("shows the server message in the error alert when available", async () => {
    mockPost.mockRejectedValue(
      Object.assign(new Error("x"), {
        response: { data: { message: "Custom server error" } },
      }),
    );

    renderLoginForm("validuser");
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Custom server error" }),
      ),
    );
  });

  it("shows fallback error message when response has no message", async () => {
    mockPost.mockRejectedValue(new Error("bare error"));

    renderLoginForm("validuser");
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Login failed. Please try again." }),
      ),
    );
  });

  it("shows error alert when no WebAuthn credentials found (success=false)", async () => {
    mockPost.mockResolvedValue({
      data: {
        success: false,
        message: "No webauthn credentials found",
      },
    });

    renderLoginForm("validuser");
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "No webauthn credentials found",
        }),
      ),
    );
  });

  it("shows error alert with fallback message for generic success=false", async () => {
    mockPost.mockResolvedValue({
      data: { success: false, message: "Unknown error occurred" },
    });

    renderLoginForm("validuser");
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "error" }),
      ),
    );
  });
});

describe("WebAuthnLoginForm – geolocation prompt → consent drawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPost.mockResolvedValue({
      data: { success: true, data: { challenge: "abc" } },
    });

    Object.defineProperty(navigator, "permissions", {
      value: {
        query: vi.fn().mockResolvedValue({ state: "prompt" }),
      },
      configurable: true,
    });
  });

  it("opens the LocationConsentDrawer when geolocation is 'prompt'", async () => {
    renderLoginForm("validuser");
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form")!,
    );

    await waitFor(() =>
      expect(screen.getByTestId("location-drawer")).toBeInTheDocument(),
    );
  });
});

describe("WebAuthnLoginForm – geolocation denied", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPost.mockResolvedValue({
      data: { success: true, data: { challenge: "abc" } },
    });

    Object.defineProperty(navigator, "permissions", {
      value: {
        query: vi.fn().mockResolvedValue({ state: "denied" }),
      },
      configurable: true,
    });
  });

  it("shows a warning alert when geolocation is denied and proceeds", async () => {
    const { performWebAuthnLogin } = await import("@web/core/webauthn");
    (performWebAuthnLogin as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      accessToken: "tok",
    });
    mockApiClient.mockResolvedValue({ data: [] });

    renderLoginForm("validuser");
    fireEvent.submit(
      screen.getByRole("button", { name: /submit/i }).closest("form")!,
    );

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "warning" }),
      ),
    );
  });
});
