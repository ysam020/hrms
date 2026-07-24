import { beforeEach } from "vitest";
import {
  generateDeviceFingerprint,
  isCurrentDevice,
} from "@web/shared/utils/pushNotifications/deviceFingerprint";

describe("generateDeviceFingerprint", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns a stable id (persisted in localStorage) and populated deviceInfo", async () => {
    const { deviceFingerprint, deviceInfo } = await generateDeviceFingerprint();

    expect(deviceFingerprint).toBe(localStorage.getItem("hrms_device_id"));
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

  it("keeps the same fingerprint across simulated browser/OS updates — the whole point of persisting it, since the old UA-derived hash would otherwise change and orphan the device's fcmTokens entry", async () => {
    const before = await generateDeviceFingerprint();

    // A browser auto-update changes navigator.userAgent between sessions —
    // simulate that without touching the persisted device id.
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent.replace(/Chrome\/[\d.]+/, "Chrome/999.0.0.0"),
      configurable: true,
    });

    const after = await generateDeviceFingerprint();
    expect(after.deviceFingerprint).toBe(before.deviceFingerprint);

    Object.defineProperty(navigator, "userAgent", {
      value: originalUserAgent,
      configurable: true,
    });
  });

  it("falls back to a UA-derived hash when localStorage is unavailable, without throwing", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    });

    const { deviceFingerprint } = await generateDeviceFingerprint();
    expect(deviceFingerprint).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex digest

    vi.unstubAllGlobals();
  });

  it("falls back to a random fingerprint when both storage and hashing fail, without throwing", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
    });
    const originalDigest = crypto.subtle.digest;
    (crypto.subtle as any).digest = vi
      .fn()
      .mockRejectedValue(new Error("no crypto"));

    const { deviceFingerprint, deviceInfo } = await generateDeviceFingerprint();

    expect(deviceFingerprint).toMatch(/^fallback_/);
    expect(deviceInfo.browser).toBe("Unknown");

    vi.unstubAllGlobals();
    crypto.subtle.digest = originalDigest;
  });
});

describe("isCurrentDevice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns true when the stored fingerprint matches the current device's", async () => {
    const { deviceFingerprint } = await generateDeviceFingerprint();
    expect(await isCurrentDevice(deviceFingerprint)).toBe(true);
  });

  it("returns false when the stored fingerprint does not match", async () => {
    expect(await isCurrentDevice("some-other-fingerprint")).toBe(false);
  });
});
