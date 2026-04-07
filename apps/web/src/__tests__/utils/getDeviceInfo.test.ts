import { getDeviceInfo } from "@web/shared/utils/getDeviceInfo";

vi.mock("ua-parser-js", () => {
  class UAParser {
    private ua: string;
    constructor(ua?: string) {
      this.ua = ua ?? "";
    }
    getBrowser() {
      if (this.ua.includes("Chrome")) return { name: "Chrome" };
      if (this.ua.includes("Firefox")) return { name: "Firefox" };
      return { name: undefined };
    }
    getOS() {
      if (this.ua.includes("Windows")) return { name: "Windows" };
      if (this.ua.includes("Mac")) return { name: "macOS" };
      return { name: undefined };
    }
    getDevice() {
      if (this.ua.includes("Mobile"))
        return { type: "mobile", model: "iPhone", vendor: "Apple" };
      if (this.ua.includes("Tablet"))
        return { type: "tablet", model: "iPad", vendor: "Apple" };
      return { type: undefined, model: undefined, vendor: undefined };
    }
  }
  return { UAParser };
});

describe("getDeviceInfo", () => {
  it("returns desktop info for desktop user agent", () => {
    const result = getDeviceInfo({
      userAgent: "Mozilla/5.0 Chrome Windows",
    });
    expect(result).toContain("Desktop");
    expect(result).toContain("Chrome");
    expect(result).toContain("Windows");
  });

  it("returns mobile info for mobile user agent", () => {
    const result = getDeviceInfo({
      userAgent: "Mozilla/5.0 Mobile",
    });
    expect(result).toContain("mobile");
    expect(result).toContain("iPhone");
    expect(result).toContain("Apple");
  });

  it("returns tablet info for tablet user agent", () => {
    const result = getDeviceInfo({
      userAgent: "Mozilla/5.0 Tablet",
    });
    expect(result).toContain("tablet");
    expect(result).toContain("iPad");
  });

  it("returns Desktop when no device type detected but browser/OS are present", () => {
    const result = getDeviceInfo({ userAgent: "Mozilla/5.0 Chrome" });
    // device.type is undefined → deviceName = "Desktop" → truthy → combined
    expect(result).toContain("Desktop");
  });

  it("handles null/undefined item gracefully", () => {
    // ua-parser-js called with undefined userAgent — returns defaults (no type)
    const result = getDeviceInfo(null);
    expect(typeof result).toBe("string");
  });

  it("handles missing userAgent field", () => {
    const result = getDeviceInfo({});
    expect(typeof result).toBe("string");
  });
});
