import { generateToken } from "@web/shared/utils/pushNotifications/generateFcmToken";
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

// jsdom doesn't implement the Notification API at all.
if (typeof (globalThis as any).Notification === "undefined") {
  (globalThis as any).Notification = { requestPermission: vi.fn() };
}

describe("generateToken", () => {
  const originalRequestPermission = (Notification as any).requestPermission;

  beforeEach(() => {
    vi.clearAllMocks();
    (Notification as any).requestPermission = vi.fn();
  });

  afterEach(() => {
    (Notification as any).requestPermission = originalRequestPermission;
  });

  it("warns and stops when the user denies notification permission", async () => {
    (Notification.requestPermission as any).mockResolvedValue("denied");
    const setAlert = vi.fn();

    await generateToken(setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "warning",
        message: expect.stringContaining("denied"),
      }),
    );
    expect(mockGetMessaging).not.toHaveBeenCalled();
  });

  it("warns and stops when Firebase returns no token", async () => {
    (Notification.requestPermission as any).mockResolvedValue("granted");
    mockGetMessaging.mockResolvedValue({ token: null });
    const setAlert = vi.fn();

    await generateToken(setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
    expect(saveToken).not.toHaveBeenCalled();
  });

  it("saves the token with the device fingerprint/info and returns it on success", async () => {
    (Notification.requestPermission as any).mockResolvedValue("granted");
    mockGetMessaging.mockResolvedValue({ token: "fcm-tok" });

    const result = await generateToken(vi.fn());

    expect(saveToken).toHaveBeenCalledWith(
      "fcm-tok",
      "fp-1",
      { browser: "Chrome" },
      expect.any(Function),
    );
    expect(result).toBe("fcm-tok");
  });

  it("shows a generic error alert and does not throw when something unexpected fails", async () => {
    (Notification.requestPermission as any).mockRejectedValue(
      new Error("boom"),
    );
    const setAlert = vi.fn();

    await expect(generateToken(setAlert)).resolves.toBeUndefined();
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("Something went wrong"),
      }),
    );
  });

  it("does not throw when called without a setAlert callback", async () => {
    (Notification.requestPermission as any).mockResolvedValue("denied");
    await expect(generateToken(undefined)).resolves.toBeUndefined();
  });
});
