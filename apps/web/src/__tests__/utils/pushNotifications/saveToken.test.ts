import { saveToken } from "@web/shared/utils/pushNotifications/saveToken";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { put: vi.fn() },
}));

const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

describe("saveToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUTs the token/fingerprint/deviceInfo to the server", async () => {
    mockPut.mockResolvedValue({ data: {} });
    await saveToken("tok-1", "fp-1", { browser: "Chrome" }, vi.fn());
    expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
      fcmToken: "tok-1",
      deviceFingerprint: "fp-1",
      deviceInfo: { browser: "Chrome" },
    });
  });

  it("shows a network-specific message on a Network Error", async () => {
    mockPut.mockRejectedValue(new Error("Network Error"));
    const setAlert = vi.fn();
    await saveToken("tok-1", "fp-1", {}, setAlert);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("back online"),
      }),
    );
  });

  it("shows the server-provided error message on other failures", async () => {
    mockPut.mockRejectedValue({
      response: { data: { message: "Invalid token" } },
    });
    const setAlert = vi.fn();
    await saveToken("tok-1", "fp-1", {}, setAlert);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: "Invalid token" }),
    );
  });

  it("does not throw when no setAlert callback is provided", async () => {
    mockPut.mockRejectedValue(new Error("boom"));
    await expect(
      saveToken("tok-1", "fp-1", {}, undefined),
    ).resolves.toBeUndefined();
  });
});
