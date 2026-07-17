import { refreshFcmToken } from "@web/shared/utils/pushNotifications/refreshFcmToken";
import { getFirebaseMessaging } from "@web/core/config/firebase";
import { saveToken } from "@web/shared/utils/pushNotifications/saveToken";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";

vi.mock("@web/core/config/firebase", () => ({
  getFirebaseMessaging: vi.fn(),
}));

vi.mock("@web/shared/utils/pushNotifications/saveToken", () => ({
  saveToken: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@web/shared/utils/pushNotifications/deviceFingerprint", () => ({
  generateDeviceFingerprint: vi.fn().mockResolvedValue({
    deviceFingerprint: "fp-1",
    deviceInfo: { browser: "Chrome" },
  }),
}));

const mockGetMessaging = getFirebaseMessaging as unknown as ReturnType<
  typeof vi.fn
>;

describe("refreshFcmToken", () => {
  const originalPermissions = navigator.permissions;

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    Object.defineProperty(navigator, "permissions", {
      value: originalPermissions,
      configurable: true,
    });
  });

  function mockPermissionState(state: string) {
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn().mockResolvedValue({ state }) },
      configurable: true,
    });
  }

  it("saves a new token when granted and this device has no matching token yet", async () => {
    mockPermissionState("granted");
    mockGetMessaging.mockResolvedValue({ token: "new-tok" });

    await refreshFcmToken(vi.fn(), vi.fn(), []);

    expect(saveToken).toHaveBeenCalledWith(
      "new-tok",
      "fp-1",
      { browser: "Chrome" },
      expect.any(Function),
    );
  });

  it("does not re-save when the current token already matches the stored one for this device", async () => {
    mockPermissionState("granted");
    mockGetMessaging.mockResolvedValue({ token: "same-tok" });

    await refreshFcmToken(vi.fn(), vi.fn(), [
      { deviceFingerprint: "fp-1", token: "same-tok" },
    ]);

    expect(saveToken).not.toHaveBeenCalled();
  });

  it("saves when the stored token for this device is stale", async () => {
    mockPermissionState("granted");
    mockGetMessaging.mockResolvedValue({ token: "rotated-tok" });

    await refreshFcmToken(vi.fn(), vi.fn(), [
      { deviceFingerprint: "fp-1", token: "old-tok" },
    ]);

    expect(saveToken).toHaveBeenCalledWith(
      "rotated-tok",
      "fp-1",
      { browser: "Chrome" },
      expect.any(Function),
    );
  });

  it("shows the consent drawer on 'prompt' only if this device was never enrolled before", async () => {
    mockPermissionState("prompt");
    const setShowConsentDrawer = vi.fn();

    await refreshFcmToken(setShowConsentDrawer, vi.fn(), []);

    expect(setShowConsentDrawer).toHaveBeenCalledWith(true);
  });

  it("does not re-prompt on 'prompt' when this device was already enrolled", async () => {
    mockPermissionState("prompt");
    const setShowConsentDrawer = vi.fn();

    await refreshFcmToken(setShowConsentDrawer, vi.fn(), [
      { deviceFingerprint: "fp-1", token: "x" },
    ]);

    expect(setShowConsentDrawer).not.toHaveBeenCalled();
  });

  it("warns and returns a notificationUnavailable result when permission is denied", async () => {
    mockPermissionState("denied");
    const setAlert = vi.fn();

    const result = await refreshFcmToken(vi.fn(), setAlert, []);

    expect(result).toEqual({
      notificationUnavailable: true,
      reason: "permission-denied",
    });
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
  });

  it("does not throw when the permissions query itself fails", async () => {
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn().mockRejectedValue(new Error("unsupported")) },
      configurable: true,
    });
    await expect(
      refreshFcmToken(vi.fn(), vi.fn(), []),
    ).resolves.toBeUndefined();
  });
});
