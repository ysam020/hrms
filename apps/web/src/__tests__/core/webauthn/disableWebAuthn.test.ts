import {
  disableWebAuthnCredential,
  disableAllWebAuthn,
  getCurrentDeviceCredentialId,
  setCurrentDeviceCredentialId,
} from "@web/core/webauthn/disableWebAuthn";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { delete: vi.fn() },
}));

const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

describe("disableWebAuthnCredential", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the given credential and shows a success alert", async () => {
    mockDelete.mockResolvedValue({ data: { message: "Credential removed" } });
    const setAlert = vi.fn();
    await disableWebAuthnCredential("cred-1", setAlert);
    expect(mockDelete).toHaveBeenCalledWith(expect.any(String), {
      data: { credentialId: "cred-1" },
    });
    expect(setAlert).toHaveBeenCalledWith({
      open: true,
      message: "Credential removed",
      severity: "success",
    });
  });

  it("shows the server error message on failure", async () => {
    mockDelete.mockRejectedValue({
      response: { data: { message: "Not allowed" } },
    });
    const setAlert = vi.fn();
    await disableWebAuthnCredential("cred-1", setAlert);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error", message: "Not allowed" }),
    );
  });

  it("falls back to a generic error message when none is provided", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));
    const setAlert = vi.fn();
    await disableWebAuthnCredential("cred-1", setAlert);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Error disabling WebAuthn credential",
      }),
    );
  });
});

describe("disableAllWebAuthn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends disableAll:true and shows a success alert", async () => {
    mockDelete.mockResolvedValue({
      data: { message: "All credentials removed" },
    });
    const setAlert = vi.fn();
    await disableAllWebAuthn(setAlert);
    expect(mockDelete).toHaveBeenCalledWith(expect.any(String), {
      data: { disableAll: true },
    });
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "All credentials removed",
      }),
    );
  });

  it("shows a generic error message on failure with no server message", async () => {
    mockDelete.mockRejectedValue(new Error("boom"));
    const setAlert = vi.fn();
    await disableAllWebAuthn(setAlert);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Error disabling WebAuthn" }),
    );
  });
});

describe("current device credential id (localStorage)", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when nothing is stored", () => {
    expect(getCurrentDeviceCredentialId()).toBeNull();
  });

  it("round-trips a stored credential id", () => {
    setCurrentDeviceCredentialId("cred-abc");
    expect(getCurrentDeviceCredentialId()).toBe("cred-abc");
  });
});
