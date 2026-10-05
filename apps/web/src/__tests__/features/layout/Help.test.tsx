import { render, screen } from "@testing-library/react";
import Help from "@web/features/layout/Help";
import { ThemeContext } from "@web/app/providers/ThemeContext";

function mockUserAgent(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function renderHelp() {
  return render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <Help />
    </ThemeContext.Provider>,
  );
}

describe("Help", () => {
  const originalUA = window.navigator.userAgent;
  afterEach(() => mockUserAgent(originalUA));

  it("shows support and business enquiry emails", () => {
    renderHelp();
    expect(screen.getByText("support@praesto.in")).toHaveAttribute(
      "href",
      "mailto:support@praesto.in",
    );
    expect(screen.getByText("hello@praesto.in")).toHaveAttribute(
      "href",
      "mailto:hello@praesto.in",
    );
  });

  it("groups keyboard shortcuts by category", () => {
    renderHelp();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Toggle Fullscreen")).toBeInTheDocument();
    expect(screen.getByText("Toggle AI Assistant")).toBeInTheDocument();
  });

  it("shows Ctrl-based shortcuts and a Windows/Linux footer note on non-mac user agents", () => {
    mockUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    renderHelp();
    expect(screen.getAllByText("Ctrl").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Windows\/Linux shortcuts detected automatically/),
    ).toBeInTheDocument();
  });

  it("shows Cmd-based shortcuts and a macOS footer note on a mac user agent", () => {
    mockUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    renderHelp();
    expect(screen.getAllByText("⌘").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/macOS shortcuts detected automatically/),
    ).toBeInTheDocument();
  });
});
