import { getGeolocation } from "@web/core/auth/getGeolocation";

describe("getGeolocation", () => {
  const originalGeolocation = navigator.geolocation;
  const originalPermissions = navigator.permissions;

  afterEach(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: originalGeolocation,
      configurable: true,
    });
    Object.defineProperty(navigator, "permissions", {
      value: originalPermissions,
      configurable: true,
    });
  });

  it("warns and returns locationUnavailable when the browser has no geolocation API", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: undefined,
      configurable: true,
    });
    const setAlert = vi.fn();

    const result = await getGeolocation(setAlert, vi.fn());

    expect(result).toEqual({
      locationUnavailable: true,
      reason: "browser-unsupported",
    });
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
  });

  it("returns coordinates when permission is already granted", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (success: any) =>
          success({ coords: { latitude: 12.34, longitude: 56.78 } }),
      },
      configurable: true,
    });
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
      configurable: true,
    });

    const result = await getGeolocation(vi.fn(), vi.fn());

    expect(result).toEqual({ latitude: 12.34, longitude: 56.78 });
  });

  it("opens the consent drawer and returns null when permission state is 'prompt'", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
      configurable: true,
    });
    const setShowConsentDrawer = vi.fn();

    const result = await getGeolocation(vi.fn(), setShowConsentDrawer);

    expect(setShowConsentDrawer).toHaveBeenCalledWith(true);
    expect(result).toBeNull();
  });

  it("warns and returns locationUnavailable when permission is denied", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
    Object.defineProperty(navigator, "permissions", {
      value: { query: vi.fn().mockResolvedValue({ state: "denied" }) },
      configurable: true,
    });
    const setAlert = vi.fn();

    const result = await getGeolocation(setAlert, vi.fn());

    expect(result).toEqual({
      locationUnavailable: true,
      reason: "permission-denied",
    });
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
  });

  it("warns and returns locationUnavailable when the permissions query itself throws", async () => {
    Object.defineProperty(navigator, "geolocation", {
      value: {},
      configurable: true,
    });
    Object.defineProperty(navigator, "permissions", {
      value: {
        query: vi
          .fn()
          .mockRejectedValue(new Error("permissions API unavailable")),
      },
      configurable: true,
    });
    const setAlert = vi.fn();

    const result = await getGeolocation(setAlert, vi.fn());

    expect(result).toEqual({
      locationUnavailable: true,
      reason: "permission-error",
    });
  });

  it.each([
    [1, "permission-denied"],
    [2, "position-unavailable"],
    [3, "timeout"],
    [99, "unknown"],
  ])(
    "maps GeolocationPositionError code %s to reason '%s' when granted but getCurrentPosition fails",
    async (code, expectedReason) => {
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition: (_success: any, error: any) => error({ code }),
        },
        configurable: true,
      });
      Object.defineProperty(navigator, "permissions", {
        value: { query: vi.fn().mockResolvedValue({ state: "granted" }) },
        configurable: true,
      });
      const setAlert = vi.fn();

      const result = await getGeolocation(setAlert, vi.fn());

      expect(result).toEqual({
        locationUnavailable: true,
        reason: expectedReason,
      });
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "warning" }),
      );
    },
  );
});
