import { render, screen, fireEvent } from "@testing-library/react";
import NotificationConsentDrawer from "@web/shared/components/NotificationConsentDrawer";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { BottomDrawerProvider } from "@web/app/providers/BottomDrawerContext";
import { generateToken } from "@web/shared/utils/pushNotifications/generateFcmToken";

vi.mock("@web/shared/utils/pushNotifications/generateFcmToken", () => ({
  generateToken: vi.fn(),
}));
const mockGenerateToken = generateToken as unknown as ReturnType<typeof vi.fn>;

function renderDrawer(
  showConsentDrawer = true,
  setAlert = vi.fn(),
  setShowConsentDrawer = vi.fn(),
) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <BottomDrawerProvider>
        <NotificationConsentDrawer
          showConsentDrawer={showConsentDrawer}
          setShowConsentDrawer={setShowConsentDrawer}
          setAlert={setAlert}
        />
      </BottomDrawerProvider>
    </ThemeContext.Provider>,
  );
  return { setAlert, setShowConsentDrawer };
}

describe("NotificationConsentDrawer", () => {
  beforeEach(() => mockGenerateToken.mockReset());

  it("requests a push token and closes the drawer when the user allows", async () => {
    mockGenerateToken.mockResolvedValue("token");
    const { setShowConsentDrawer, setAlert } = renderDrawer();

    fireEvent.click(
      screen.getByText("Enable Notifications", { selector: "span" }),
    );

    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
    expect(mockGenerateToken).toHaveBeenCalledWith(setAlert);
  });

  it("shows an informational alert and closes the drawer when the user declines", () => {
    const { setShowConsentDrawer, setAlert } = renderDrawer();

    fireEvent.click(screen.getByText("Not Now", { selector: "span" }));

    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "info",
        message: "You can enable notifications later from settings.",
      }),
    );
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });

  it("closes the drawer via the close button without any side effects", () => {
    const { setShowConsentDrawer, setAlert } = renderDrawer();

    fireEvent.click(screen.getByLabelText("Close notification consent dialog"));

    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
    expect(setAlert).not.toHaveBeenCalled();
    expect(mockGenerateToken).not.toHaveBeenCalled();
  });
});
