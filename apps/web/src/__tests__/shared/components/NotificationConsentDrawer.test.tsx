import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NotificationConsentDrawer from "@web/shared/components/NotificationConsentDrawer";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import { BottomDrawerProvider } from "@web/app/providers/BottomDrawerContext";
import { generateToken } from "@web/shared/utils/pushNotifications/generateFcmToken";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";

vi.mock("@web/shared/utils/pushNotifications/generateFcmToken", () => ({
  generateToken: vi.fn(),
}));
vi.mock("@web/shared/utils/pushNotifications/deviceFingerprint", () => ({
  generateDeviceFingerprint: vi.fn(),
}));
const mockGenerateToken = generateToken as unknown as ReturnType<typeof vi.fn>;
const mockFingerprint = generateDeviceFingerprint as unknown as ReturnType<
  typeof vi.fn
>;

function renderDrawer(
  showConsentDrawer = true,
  setAlert = vi.fn(),
  setShowConsentDrawer = vi.fn(),
  setUser = vi.fn(),
) {
  render(
    <ThemeContext.Provider
      value={{ theme: "light", toggleTheme: vi.fn() } as any}
    >
      <UserContext.Provider value={{ user: {}, setUser } as any}>
        <BottomDrawerProvider>
          <NotificationConsentDrawer
            showConsentDrawer={showConsentDrawer}
            setShowConsentDrawer={setShowConsentDrawer}
            setAlert={setAlert}
          />
        </BottomDrawerProvider>
      </UserContext.Provider>
    </ThemeContext.Provider>,
  );
  return { setAlert, setShowConsentDrawer, setUser };
}

describe("NotificationConsentDrawer", () => {
  beforeEach(() => {
    mockGenerateToken.mockReset();
    mockFingerprint.mockReset();
  });

  it("requests a push token and closes the drawer when the user allows", async () => {
    mockGenerateToken.mockResolvedValue("token");
    mockFingerprint.mockResolvedValue({
      deviceFingerprint: "fp-1",
      deviceInfo: { browser: "Chrome" },
    });
    const { setShowConsentDrawer, setAlert } = renderDrawer();

    fireEvent.click(
      screen.getByText("Enable Notifications", { selector: "span" }),
    );

    expect(setShowConsentDrawer).toHaveBeenCalledWith(false);
    expect(mockGenerateToken).toHaveBeenCalledWith(setAlert);
    await waitFor(() => expect(mockFingerprint).toHaveBeenCalled());
  });

  it("syncs the new token into UserContext.user.fcmTokens so it doesn't wait for a full profile refetch", async () => {
    mockGenerateToken.mockResolvedValue("token-abc");
    mockFingerprint.mockResolvedValue({
      deviceFingerprint: "fp-1",
      deviceInfo: { browser: "Chrome" },
    });
    const { setUser } = renderDrawer();

    fireEvent.click(
      screen.getByText("Enable Notifications", { selector: "span" }),
    );

    await waitFor(() => expect(setUser).toHaveBeenCalled());
    const updater = setUser.mock.calls[0][0];
    const result = updater({ fcmTokens: [] });
    expect(result.fcmTokens).toEqual([
      expect.objectContaining({
        token: "token-abc",
        deviceFingerprint: "fp-1",
      }),
    ]);
  });

  it("does not touch UserContext when generateToken returns no token (e.g. permission denied)", async () => {
    mockGenerateToken.mockResolvedValue(undefined);
    const { setUser } = renderDrawer();

    fireEvent.click(
      screen.getByText("Enable Notifications", { selector: "span" }),
    );

    await waitFor(() => expect(mockGenerateToken).toHaveBeenCalled());
    expect(setUser).not.toHaveBeenCalled();
    expect(mockFingerprint).not.toHaveBeenCalled();
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
