import { initiateWebauthnRegistration } from "@web/core/webauthn/initiateWebauthnRegistration";
import apiClient from "@web/core/http/axiosConfig";
import { verifyWebauthnRegistration } from "@web/core/webauthn/verifyWebauthnRegistration";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: vi.fn(),
}));

vi.mock("@web/core/webauthn/verifyWebauthnRegistration", () => ({
  verifyWebauthnRegistration: vi.fn().mockResolvedValue(undefined),
}));

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;
const mockVerify = verifyWebauthnRegistration as unknown as ReturnType<
  typeof vi.fn
>;

function withChallenge(challenge = "QUJD", userId = "QUJD") {
  return {
    challenge,
    user: { id: userId, name: "jdoe" },
    rp: { name: "HRMS" },
  };
}

describe("initiateWebauthnRegistration", () => {
  const originalPKC = (window as any).PublicKeyCredential;
  const originalCredentials = navigator.credentials;

  beforeEach(() => {
    vi.clearAllMocks();
    (window as any).PublicKeyCredential = {
      isUserVerifyingPlatformAuthenticatorAvailable: vi
        .fn()
        .mockResolvedValue(true),
    };
    Object.defineProperty(navigator, "credentials", {
      value: { create: vi.fn(), get: vi.fn() },
      configurable: true,
    });
  });

  afterEach(() => {
    (window as any).PublicKeyCredential = originalPKC;
    Object.defineProperty(navigator, "credentials", {
      value: originalCredentials,
      configurable: true,
    });
  });

  it("shows an error and stops when WebAuthn isn't supported", async () => {
    delete (window as any).PublicKeyCredential;
    const setAlert = vi.fn();

    await initiateWebauthnRegistration(setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "WebAuthn is not supported in this browser",
      }),
    );
    expect(mockApiClient).not.toHaveBeenCalled();
  });

  it("warns (but continues) when no biometric authenticator is available", async () => {
    (
      window as any
    ).PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = vi
      .fn()
      .mockResolvedValue(false);
    mockApiClient.mockResolvedValue({ data: withChallenge() });
    (navigator.credentials.create as any).mockResolvedValue({ id: "cred-1" });
    const setAlert = vi.fn();

    await initiateWebauthnRegistration(setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
    expect(mockVerify).toHaveBeenCalled();
  });

  it("converts the challenge and user id, then creates the credential and verifies it", async () => {
    mockApiClient.mockResolvedValue({ data: withChallenge() });
    const createdCredential = { id: "cred-1" };
    (navigator.credentials.create as any).mockResolvedValue(createdCredential);
    const setAlert = vi.fn();

    await initiateWebauthnRegistration(setAlert);

    expect(navigator.credentials.create).toHaveBeenCalledWith(
      expect.objectContaining({
        publicKey: expect.objectContaining({
          challenge: expect.any(Uint8Array),
          user: expect.objectContaining({ id: expect.any(Uint8Array) }),
        }),
      }),
    );
    expect(mockVerify).toHaveBeenCalledWith(createdCredential, setAlert);
  });

  it("converts excludeCredentials entries and drops invalid ones", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        ...withChallenge(),
        excludeCredentials: [{ id: "QUJD" }, { id: 42 }, { id: null }],
      },
    });
    (navigator.credentials.create as any).mockResolvedValue({ id: "cred-1" });

    await initiateWebauthnRegistration(vi.fn());

    const callArg = (navigator.credentials.create as any).mock.calls[0][0];
    expect(callArg.publicKey.excludeCredentials).toHaveLength(1);
    expect(callArg.publicKey.excludeCredentials[0].type).toBe("public-key");
  });

  it("shows a cancelled-specific message for NotAllowedError", async () => {
    mockApiClient.mockResolvedValue({ data: withChallenge() });
    const err = new Error("cancelled");
    err.name = "NotAllowedError";
    (navigator.credentials.create as any).mockRejectedValue(err);
    const setAlert = vi.fn();

    await initiateWebauthnRegistration(setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Registration was cancelled"),
      }),
    );
  });

  it("shows a device-already-registered message for InvalidStateError", async () => {
    mockApiClient.mockResolvedValue({ data: withChallenge() });
    const err = new Error("dup");
    err.name = "InvalidStateError";
    (navigator.credentials.create as any).mockRejectedValue(err);
    const setAlert = vi.fn();

    await initiateWebauthnRegistration(setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("already has a passkey"),
      }),
    );
  });

  it("throws and alerts when navigator.credentials.create returns nothing", async () => {
    mockApiClient.mockResolvedValue({ data: withChallenge() });
    (navigator.credentials.create as any).mockResolvedValue(null);
    const setAlert = vi.fn();

    await initiateWebauthnRegistration(setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining("Failed to create credential"),
      }),
    );
    expect(mockVerify).not.toHaveBeenCalled();
  });

  it("unwraps the response.data.data envelope when present", async () => {
    mockApiClient.mockResolvedValue({ data: { data: withChallenge() } });
    (navigator.credentials.create as any).mockResolvedValue({ id: "cred-1" });

    await initiateWebauthnRegistration(vi.fn());

    expect(navigator.credentials.create).toHaveBeenCalled();
  });
});
