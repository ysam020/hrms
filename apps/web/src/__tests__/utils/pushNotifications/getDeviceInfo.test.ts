import { getDeviceInfo } from "@web/shared/utils/pushNotifications/getDeviceInfo";

describe("getDeviceInfo (pushNotifications)", () => {
  it("combines browser and OS info for a typical desktop Chrome user agent", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const result = getDeviceInfo(ua);
    expect(result).toContain("Chrome");
    expect(result).toContain("Windows");
  });

  it("includes device vendor/model when present (mobile user agent)", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    const result = getDeviceInfo(ua);
    expect(result).toContain("Pixel 7");
  });

  it("falls back to the capitalized device type when nothing else is identifiable", () => {
    const result = getDeviceInfo("");
    expect(result).toEqual(expect.any(String));
    expect(result.length).toBeGreaterThan(0);
  });

  it("joins multiple parts with the bullet separator", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    const result = getDeviceInfo(ua);
    expect(result).toContain(" • ");
  });
});
