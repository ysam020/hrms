import {
  generateDeviceFingerprint,
  isCurrentDevice,
} from "@web/shared/utils/pushNotifications/deviceFingerprint";

describe("generateDeviceFingerprint", () => {
  it("returns a deterministic hex fingerprint and populated deviceInfo", async () => {
    const { deviceFingerprint, deviceInfo } = await generateDeviceFingerprint();

    expect(deviceFingerprint).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex digest
    expect(deviceInfo).toEqual(
      expect.objectContaining({
        userAgent: navigator.userAgent,
        platform: expect.any(String),
        screenResolution: expect.stringMatching(/^\d+x\d+$/),
        timezone: expect.any(String),
        language: expect.any(String),
      }),
    );
  });

  it("produces the same fingerprint on repeated calls in the same environment (stable, not random)", async () => {
    const a = await generateDeviceFingerprint();
    const b = await generateDeviceFingerprint();
    expect(a.deviceFingerprint).toBe(b.deviceFingerprint);
  });

  it("falls back to a random fingerprint when hashing fails, without throwing", async () => {
    const originalDigest = crypto.subtle.digest;
    (crypto.subtle as any).digest = vi
      .fn()
      .mockRejectedValue(new Error("no crypto"));

    const { deviceFingerprint, deviceInfo } = await generateDeviceFingerprint();

    expect(deviceFingerprint).toMatch(/^fallback_/);
    expect(deviceInfo.browser).toBe("Unknown");

    crypto.subtle.digest = originalDigest;
  });
});

describe("isCurrentDevice", () => {
  it("returns true when the stored fingerprint matches the current device's", async () => {
    const { deviceFingerprint } = await generateDeviceFingerprint();
    expect(await isCurrentDevice(deviceFingerprint)).toBe(true);
  });

  it("returns false when the stored fingerprint does not match", async () => {
    expect(await isCurrentDevice("some-other-fingerprint")).toBe(false);
  });
});
