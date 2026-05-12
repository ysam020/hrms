import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";
import LoginPage from "@web/features/auth/LoginPage";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";

// Mock lazy-loaded WebAuthnLoginForm
vi.mock("@web/features/auth/WebAuthnLoginForm", () => ({
  default: ({ setUseWebAuthn }: any) => (
    <div data-testid="webauthn-form">
      <button onClick={() => setUseWebAuthn(false)}>Back</button>
    </div>
  ),
}));

// Mock SCSS import
vi.mock("@web/styles/login.scss", () => ({}));

// Mock SVG logo components
vi.mock("@web/assets/data/LogoDark", () => ({
  default: () => <svg data-testid="logo-dark" />,
}));
vi.mock("@web/assets/data/LogoLight", () => ({
  default: () => <svg data-testid="logo-light" />,
}));

const mockSetAlert = vi.fn();
const mockNavigate = vi.fn();
let mockSearch = "";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: mockSearch, pathname: "/login" }),
  };
});

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

const renderLoginPage = (theme: "light" | "dark" = "light") =>
  render(
    <MemoryRouter future={routerFuture}>
      <ThemeContext.Provider value={{ theme, toggleTheme: vi.fn() }}>
        <AlertContext.Provider
          value={{
            alert: { open: false, message: "", severity: "info" },
            setAlert: mockSetAlert,
          }}
        >
          <Suspense fallback={<div>Loading...</div>}>
            <LoginPage />
          </Suspense>
        </AlertContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch = "";
  });

  it("renders 'Sign in with Google' button", () => {
    renderLoginPage();
    expect(screen.getAllByText("Sign in with Google")[0]).toBeInTheDocument();
  });

  it("renders 'Use Security Key / Biometric' button", () => {
    renderLoginPage();
    expect(screen.getByText(/Use Security Key/i)).toBeInTheDocument();
  });

  it("renders page title", () => {
    renderLoginPage();
    expect(screen.getByText("Sign In to Continue")).toBeInTheDocument();
  });

  it("renders feature highlights on left column", () => {
    renderLoginPage();
    expect(screen.getByText("Secure Employee Data")).toBeInTheDocument();
    expect(screen.getByText("Smart HR Analytics")).toBeInTheDocument();
    expect(screen.getByText("Complete HR Suite")).toBeInTheDocument();
  });

  it("renders stats section", () => {
    renderLoginPage();
    expect(screen.getByText("10K+")).toBeInTheDocument();
    expect(screen.getByText("2M+")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows WebAuthn form when 'Use Security Key' is clicked", async () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Use Security Key/i));
    await waitFor(() => {
      expect(screen.getByTestId("webauthn-form")).toBeInTheDocument();
    });
  });

  it("returns to default view when WebAuthn form calls setUseWebAuthn(false)", async () => {
    renderLoginPage();
    fireEvent.click(screen.getByText(/Use Security Key/i));
    await waitFor(() => screen.getByTestId("webauthn-form"));
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() => {
      expect(screen.queryByTestId("webauthn-form")).not.toBeInTheDocument();
    });
  });

  it("renders dark logo in dark theme", () => {
    renderLoginPage("dark");
    expect(screen.getByTestId("logo-light")).toBeInTheDocument();
  });

  it("renders light logo in light theme", () => {
    renderLoginPage("light");
    expect(screen.getByTestId("logo-dark")).toBeInTheDocument();
  });

  it("navigates to /careers when 'View Open Positions' is clicked", () => {
    renderLoginPage();
    fireEvent.click(screen.getByText("View Open Positions"));
    expect(mockNavigate).toHaveBeenCalledWith("/careers");
  });

  it("redirects to Google OAuth when Google button is clicked", () => {
    const originalLocation = window.location;
    // jsdom doesn't allow setting window.location.href directly
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
    renderLoginPage();
    fireEvent.click(screen.getAllByText("Sign in with Google")[0]);
    expect(window.location.href).toContain("/api/v1/auth/google");
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
    });
  });

  it("shows alert when error query param is present", async () => {
    mockSearch = "?error=Access%20denied";
    renderLoginPage();
    await waitFor(() => {
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({ open: true, severity: "error" }),
      );
    });
  });
});
