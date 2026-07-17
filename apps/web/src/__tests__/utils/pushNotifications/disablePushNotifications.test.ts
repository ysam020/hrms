import { disablePushNotifications } from "@web/shared/utils/pushNotifications/disablePushNotifications";
import apiClient from "@web/core/http/axiosConfig";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { delete: vi.fn() },
}));

vi.mock("@web/shared/utils/pushNotifications/deviceFingerprint", () => ({
  generateDeviceFingerprint: vi
    .fn()
    .mockResolvedValue({ deviceFingerprint: "fp-1" }),
}));

const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

describe("disablePushNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("includes this device's fingerprint when disabling only this device", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Disabled" } });
    await disablePushNotifications(vi.fn(), false);
    expect(mockDelete).toHaveBeenCalledWith(expect.any(String), {
      data: { disableAll: false, deviceFingerprint: "fp-1" },
    });
  });

  it("omits the fingerprint lookup entirely when disabling all devices", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Disabled all" } });
    await disablePushNotifications(vi.fn(), true);
    expect(generateDeviceFingerprint).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith(expect.any(String), {
      data: { disableAll: true },
    });
  });

  it("shows a success alert with the server message", async () => {
    mockDelete.mockResolvedValue({
      data: { message: "Notifications disabled" },
    });
    const setAlert = vi.fn();
    await disablePushNotifications(setAlert, true);
    expect(setAlert).toHaveBeenCalledWith({
      open: true,
      message: "Notifications disabled",
      severity: "success",
    });
  });

  it("shows a network-specific message on a Network Error", async () => {
    mockDelete.mockRejectedValue(new Error("Network Error"));
    const setAlert = vi.fn();
    await disablePushNotifications(setAlert, true);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("back online"),
      }),
    );
  });

  it("shows the server error message on other failures", async () => {
    mockDelete.mockRejectedValue({
      response: { data: { message: "Forbidden" } },
    });
    const setAlert = vi.fn();
    await disablePushNotifications(setAlert, true);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Forbidden" }),
    );
  });
});
