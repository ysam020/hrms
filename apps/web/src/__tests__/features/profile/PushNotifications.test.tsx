import { Suspense } from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import PushNotifications from "@web/features/profile/PushNotifications";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import apiClient from "@web/core/http/axiosConfig";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";
import { generateToken } from "@web/shared/utils/pushNotifications/generateFcmToken";
import { disablePushNotifications } from "@web/shared/utils/pushNotifications/disablePushNotifications";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { delete: vi.fn() } }));
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/utils/pushNotifications/deviceFingerprint", () => ({
  generateDeviceFingerprint: vi.fn(),
}));
const mockFingerprint = generateDeviceFingerprint as unknown as ReturnType<
  typeof vi.fn
>;

vi.mock("@web/shared/utils/pushNotifications/generateFcmToken", () => ({
  generateToken: vi.fn(),
}));
const mockGenerateToken = generateToken as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/utils/pushNotifications/disablePushNotifications", () => ({
  disablePushNotifications: vi.fn(),
}));
const mockDisableAll = disablePushNotifications as unknown as ReturnType<
  typeof vi.fn
>;

vi.mock("@web/shared/components/ConfirmationDialog", () => ({
  default: (props: any) =>
    props.open ? (
      <div>
        <p>{props.message}</p>
        <button onClick={props.onConfirm}>{props.confirmText}</button>
        <button onClick={props.onClose}>{props.cancelText}</button>
      </div>
    ) : null,
}));
vi.mock("@web/shared/components/EmptyState", () => ({
  default: (props: any) => <div>{props.message}</div>,
}));

function renderPush({ user = {}, setUser = vi.fn(), setAlert = vi.fn() } = {}) {
  render(
    <Suspense fallback={null}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <UserContext.Provider value={{ user, setUser } as any}>
          <AlertContext.Provider value={{ setAlert } as any}>
            <PushNotifications />
          </AlertContext.Provider>
        </UserContext.Provider>
      </ThemeContext.Provider>
    </Suspense>,
  );
  return { setUser, setAlert };
}

describe("PushNotifications", () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockFingerprint
      .mockReset()
      .mockResolvedValue({ deviceFingerprint: "fp-current", deviceInfo: {} });
    mockGenerateToken.mockReset();
    mockDisableAll.mockReset();
  });

  it("shows an empty state when there are no registered devices", async () => {
    renderPush({ user: { fcmTokens: [] } });
    expect(
      await screen.findByText(
        "No devices are currently registered for push notifications.",
      ),
    ).toBeInTheDocument();
  });

  it("disables the enable button once the current device is already registered", async () => {
    renderPush({
      user: {
        fcmTokens: [
          {
            deviceFingerprint: "fp-current",
            deviceInfo: {},
            lastUsed: new Date(),
          },
        ],
      },
    });
    expect(
      await screen.findByText(/Already enabled on this device/),
    ).toBeInTheDocument();
  });

  it("enables push on this device and merges a new fcmTokens entry", async () => {
    mockGenerateToken.mockResolvedValue("new-token");
    const { setUser, setAlert } = renderPush({ user: { fcmTokens: [] } });

    fireEvent.click(
      screen.getByText("Enable on this device", { selector: "span" }),
    );

    await waitFor(() => expect(setUser).toHaveBeenCalled());
    const updater = setUser.mock.calls[0][0];
    const result = updater({ fcmTokens: [] });
    expect(result.fcmTokens).toEqual([
      expect.objectContaining({
        token: "new-token",
        deviceFingerprint: "fp-current",
      }),
    ]);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Push notifications enabled on this device",
      }),
    );
  });

  it("updates an existing fcmTokens entry in place instead of duplicating it", async () => {
    mockGenerateToken.mockResolvedValue("refreshed-token");
    const { setUser } = renderPush({
      user: {
        fcmTokens: [
          {
            deviceFingerprint: "fp-current",
            token: "old-token",
            deviceInfo: {},
          },
        ],
      },
    });

    fireEvent.click(
      screen.getByText("Enable on this device", { selector: "span" }),
    );
    await waitFor(() => expect(setUser).toHaveBeenCalled());

    const updater = setUser.mock.calls[0][0];
    const result = updater({
      fcmTokens: [{ deviceFingerprint: "fp-current", token: "old-token" }],
    });
    expect(result.fcmTokens).toHaveLength(1);
    expect(result.fcmTokens[0].token).toBe("refreshed-token");
  });

  it("shows a 'Legacy' chip for a bare string token and blocks individual removal with a warning", async () => {
    const { setAlert } = renderPush({
      user: { fcmTokens: ["legacy-token-string"] },
    });
    expect(await screen.findByText("Legacy")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove", { selector: "span" }));
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warning",
        message:
          "Cannot remove legacy tokens individually. Please disable all devices and re-enable.",
      }),
    );
  });

  it("marks the current device with a 'This Device' badge", async () => {
    renderPush({
      user: {
        fcmTokens: [
          {
            deviceFingerprint: "fp-current",
            deviceInfo: { browser: "Chrome" },
          },
        ],
      },
    });
    expect(await screen.findByText("This Device")).toBeInTheDocument();
  });

  it("removes a single device through the confirmation dialog", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Device removed" } });
    const { setUser, setAlert } = renderPush({
      user: {
        fcmTokens: [
          {
            deviceFingerprint: "fp-other",
            deviceInfo: { browser: "Firefox" },
            lastUsed: new Date(),
          },
        ],
      },
    });

    fireEvent.click(await screen.findByText("Remove", { selector: "span" }));
    expect(
      screen.getByText(/Remove "Firefox" from push notification devices\?/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Remove", { selector: "button" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(expect.any(String), {
        data: { deviceFingerprint: "fp-other" },
      }),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Device removed",
      }),
    );

    const updater = setUser.mock.calls.find(
      (c) => typeof c[0] === "function",
    )![0];
    expect(
      updater({
        fcmTokens: [
          { deviceFingerprint: "fp-other" },
          { deviceFingerprint: "fp-keep" },
        ],
      }).fcmTokens,
    ).toEqual([{ deviceFingerprint: "fp-keep" }]);
  });

  it("disables all devices through its own confirmation dialog", async () => {
    mockDisableAll.mockResolvedValue(undefined);
    const { setUser } = renderPush({
      user: { fcmTokens: [{ deviceFingerprint: "fp-other", deviceInfo: {} }] },
    });

    fireEvent.click(
      screen.getByText("Disable all devices", { selector: "span" }),
    );
    fireEvent.click(screen.getByText("Disable All", { selector: "button" }));

    await waitFor(() =>
      expect(mockDisableAll).toHaveBeenCalledWith(expect.any(Function), true),
    );
    await waitFor(() => {
      const updater = setUser.mock.calls.find(
        (c) => typeof c[0] === "function",
      )![0];
      expect(
        updater({ fcmTokens: [{ deviceFingerprint: "fp-other" }] }).fcmTokens,
      ).toEqual([]);
    });
  });

  it("formats last-used timestamps as relative time, falling back to a full date after a week", () => {
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const daysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const longAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    renderPush({
      user: {
        fcmTokens: [
          { deviceFingerprint: "a", deviceInfo: {}, lastUsed: hourAgo },
          { deviceFingerprint: "b", deviceInfo: {}, lastUsed: daysAgo },
          { deviceFingerprint: "c", deviceInfo: {}, lastUsed: longAgo },
        ],
      },
    });

    expect(screen.getByText(/Last used: 3 hours ago/)).toBeInTheDocument();
    expect(screen.getByText(/Last used: 3 days ago/)).toBeInTheDocument();
    expect(
      screen.getByText(`Last used: ${longAgo.toLocaleDateString()}`),
    ).toBeInTheDocument();
  });

  it("falls back to 'Unknown Browser'/'Unknown OS' when device info is missing", () => {
    renderPush({
      user: { fcmTokens: [{ deviceFingerprint: "a", deviceInfo: null }] },
    });
    expect(screen.getByText("Unknown Browser")).toBeInTheDocument();
    expect(screen.getByText(/Unknown OS/)).toBeInTheDocument();
  });
});
