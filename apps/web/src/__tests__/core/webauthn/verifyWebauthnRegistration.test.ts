import { verifyWebauthnRegistration } from "@web/core/webauthn/verifyWebauthnRegistration";
import apiClient from "@web/core/http/axiosConfig";
import { setCurrentDeviceCredentialId } from "@web/core/webauthn/disableWebAuthn";
import { generateDeviceFingerprint } from "@web/shared/utils/pushNotifications/deviceFingerprint";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { post: vi.fn() },
}));

vi.mock("@web/core/webauthn/disableWebAuthn", () => ({
  setCurrentDeviceCredentialId: vi.fn(),
}));

vi.mock("@web/shared/utils/pushNotifications/deviceFingerprint", () => ({
  generateDeviceFingerprint: vi.fn(),
}));

const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockGenFingerprint = generateDeviceFingerprint as unknown as ReturnType<
  typeof vi.fn
>;

function makeCredential() {
  return {
    id: "cred-1",
    rawId: new Uint8Array([1, 2]).buffer,
    type: "public-key",
    response: {
      clientDataJSON: new Uint8Array([3, 4]).buffer,
      attestationObject: new Uint8Array([5, 6]).buffer,
      getTransports: () => ["internal"],
    },
  };
}

describe("verifyWebauthnRegistration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenFingerprint.mockResolvedValue({ deviceInfo: { browser: "Chrome" } });
  });

  it("converts ArrayBuffer fields to plain number arrays before posting", async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const setAlert = vi.fn();

    await verifyWebauthnRegistration(makeCredential(), setAlert);

    expect(mockPost).toHaveBeenCalledWith(expect.any(String), {
      credential: expect.objectContaining({
        id: "cred-1",
        rawId: [1, 2],
        response: expect.objectContaining({
          clientDataJSON: [3, 4],
          attestationObject: [5, 6],
          transports: ["internal"],
        }),
      }),
    });
  });

  it("stores the credential id and shows a success alert on success", async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const setAlert = vi.fn();

    await verifyWebauthnRegistration(makeCredential(), setAlert);

    expect(setCurrentDeviceCredentialId).toHaveBeenCalledWith("cred-1");
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "WebAuthn registration successful!",
      }),
    );
  });

  it("shows an error alert (without storing the credential) when the server reports failure", async () => {
    mockPost.mockResolvedValue({
      data: { success: false, message: "Attestation invalid" },
    });
    const setAlert = vi.fn();

    await verifyWebauthnRegistration(makeCredential(), setAlert);

    expect(setCurrentDeviceCredentialId).not.toHaveBeenCalled();
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "Attestation invalid",
      }),
    );
  });

  it("shows the server-provided error message when the request itself fails", async () => {
    mockPost.mockRejectedValue({
      response: { data: { message: "Server exploded" } },
    });
    const setAlert = vi.fn();

    await verifyWebauthnRegistration(makeCredential(), setAlert);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: "Server exploded",
      }),
    );
  });

  it("omits transports when the browser doesn't support getTransports()", async () => {
    mockPost.mockResolvedValue({ data: { success: true } });
    const credential = makeCredential();
    delete (credential.response as any).getTransports;

    await verifyWebauthnRegistration(credential, vi.fn());

    expect(mockPost).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        credential: expect.objectContaining({
          response: expect.objectContaining({ transports: undefined }),
        }),
      }),
    );
  });
});
