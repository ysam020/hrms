import { performWebAuthnLogin } from "@web/core/webauthn/performWebAuthnLogin";
import apiClient from "@web/core/http/axiosConfig";
import {
  updateFaviconWithDot,
  updateDocumentTitle,
} from "@web/shared/utils/faviconUtils";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: Object.assign(vi.fn(), { post: vi.fn() }),
}));

vi.mock("@web/shared/utils/faviconUtils", () => ({
  updateFaviconWithDot: vi.fn(),
  updateDocumentTitle: vi.fn(),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  post: ReturnType<typeof vi.fn>;
};

function baseOptions() {
  return {
    challenge: "QUJD",
    rpId: "example.com",
    allowCredentials: [{ id: "QUJD", type: "public-key" }],
  };
}

describe("performWebAuthnLogin", () => {
  const originalCredentials = navigator.credentials;
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.mockResolvedValue({ data: [] }); // GET_NOTIFICATIONS
    Object.defineProperty(navigator, "credentials", {
      value: { get: vi.fn(), create: vi.fn() },
      configurable: true,
    });
    Object.defineProperty(navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, "credentials", {
      value: originalCredentials,
      configurable: true,
    });
    Object.defineProperty(navigator, "geolocation", {
      value: originalGeolocation,
      configurable: true,
    });
  });

  function mockAssertion() {
    return {
      id: "cred-1",
      type: "public-key",
      response: {
        authenticatorData: new Uint8Array([1]).buffer,
        clientDataJSON: new Uint8Array([2]).buffer,
        signature: new Uint8Array([3]).buffer,
        userHandle: new Uint8Array([4]).buffer,
      },
    };
  }

  it("throws when options has no challenge", async () => {
    const handleLoginError = vi.fn();
    const result = await performWebAuthnLogin(
      "jdoe",
      {},
      vi.fn(),
      handleLoginError,
      vi.fn(),
    );
    expect(result.success).toBe(false);
    expect(handleLoginError).toHaveBeenCalled();
  });

  it("throws when there are no valid allowCredentials", async () => {
    const handleLoginError = vi.fn();
    const result = await performWebAuthnLogin(
      "jdoe",
      { challenge: "QUJD", allowCredentials: [] },
      vi.fn(),
      handleLoginError,
      vi.fn(),
    );
    expect(result.success).toBe(false);
  });

  it("completes a successful login: verifies, exchanges the temp token, and calls processLogin", async () => {
    (navigator.credentials.get as any).mockResolvedValue(mockAssertion());
    mockApiClient.post
      .mockResolvedValueOnce({
        data: { success: true, data: { tempToken: "temp-1" } },
      }) // verify-login
      .mockResolvedValueOnce({
        data: { success: true, data: { user: { id: "u1" } } },
      }); // login
    const processLogin = vi.fn();
    const setAlert = vi.fn();

    const result = await performWebAuthnLogin(
      "jdoe",
      baseOptions(),
      processLogin,
      vi.fn(),
      setAlert,
    );

    expect(navigator.credentials.get).toHaveBeenCalled();
    expect(mockApiClient.post).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      expect.objectContaining({ username: "jdoe" }),
    );
    expect(mockApiClient.post).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({ tempToken: "temp-1" }),
    );
    expect(processLogin).toHaveBeenCalledWith({ id: "u1" });
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Login successful!",
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ success: true, user: { id: "u1" } }),
    );
  });

  it("throws when the assertion verification response is unsuccessful", async () => {
    (navigator.credentials.get as any).mockResolvedValue(mockAssertion());
    mockApiClient.post.mockResolvedValueOnce({
      data: { success: false, message: "Bad signature" },
    });
    const handleLoginError = vi.fn();

    const result = await performWebAuthnLogin(
      "jdoe",
      baseOptions(),
      vi.fn(),
      handleLoginError,
      vi.fn(),
    );

    expect(result.success).toBe(false);
    expect(handleLoginError).toHaveBeenCalled();
  });

  it("throws when the final login exchange is unsuccessful", async () => {
    (navigator.credentials.get as any).mockResolvedValue(mockAssertion());
    mockApiClient.post
      .mockResolvedValueOnce({
        data: { success: true, data: { tempToken: "temp-1" } },
      })
      .mockResolvedValueOnce({
        data: { success: false, message: "Token expired" },
      });
    const handleLoginError = vi.fn();

    const result = await performWebAuthnLogin(
      "jdoe",
      baseOptions(),
      vi.fn(),
      handleLoginError,
      vi.fn(),
    );

    expect(result.success).toBe(false);
  });

  it("maps NotAllowedError to a cancelled/timed-out message", async () => {
    const err = new Error("cancelled");
    err.name = "NotAllowedError";
    (navigator.credentials.get as any).mockRejectedValue(err);
    const handleLoginError = vi.fn();

    await performWebAuthnLogin(
      "jdoe",
      baseOptions(),
      vi.fn(),
      handleLoginError,
      vi.fn(),
    );

    expect(handleLoginError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("cancelled or timed out"),
      }),
    );
  });

  it("maps NotSupportedError to a device-not-supported message", async () => {
    const err = new Error("unsupported");
    err.name = "NotSupportedError";
    (navigator.credentials.get as any).mockRejectedValue(err);
    const handleLoginError = vi.fn();

    await performWebAuthnLogin(
      "jdoe",
      baseOptions(),
      vi.fn(),
      handleLoginError,
      vi.fn(),
    );

    expect(handleLoginError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("not supported"),
      }),
    );
  });

  it("does not fail the whole login when geolocation is unavailable", async () => {
    (navigator.credentials.get as any).mockResolvedValue(mockAssertion());
    mockApiClient.post
      .mockResolvedValueOnce({
        data: { success: true, data: { tempToken: "temp-1" } },
      })
      .mockResolvedValueOnce({
        data: { success: true, data: { user: { id: "u1" } } },
      });
    // navigator.geolocation stays undefined (set in beforeEach)

    const result = await performWebAuthnLogin(
      "jdoe",
      baseOptions(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    expect(result.success).toBe(true);
    // geolocation defaults to nulls when unavailable
    expect(mockApiClient.post).toHaveBeenNthCalledWith(
      2,
      expect.any(String),
      expect.objectContaining({
        geolocation: { latitude: null, longitude: null },
      }),
    );
  });

  it("updates the favicon/title after a successful login based on notification count", async () => {
    (navigator.credentials.get as any).mockResolvedValue(mockAssertion());
    mockApiClient.post
      .mockResolvedValueOnce({
        data: { success: true, data: { tempToken: "temp-1" } },
      })
      .mockResolvedValueOnce({
        data: { success: true, data: { user: { id: "u1" } } },
      });
    mockApiClient.mockResolvedValue({ data: [{ id: "n1" }, { id: "n2" }] });

    await performWebAuthnLogin(
      "jdoe",
      baseOptions(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    expect(updateFaviconWithDot).toHaveBeenCalledWith(true);
    expect(updateDocumentTitle).toHaveBeenCalledWith(2);
  });
});
