import { UAParser } from "ua-parser-js";

export const generateDeviceFingerprint = async () => {
  try {
    // Initialize UA-Parser
    const parser = new UAParser();
    const result = parser.getResult();

    // Get additional browser/environment info
    const language = navigator.language || "Unknown";
    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    const screenResolution = `${window.screen.width}x${window.screen.height}`;
    const platform = navigator.platform || "Unknown";
    const userAgent = navigator.userAgent;

    // Extract parsed information
    const browser = result.browser;
    const os = result.os;
    const device = result.device;
    const engine = result.engine;

    // Determine device type
    const getDeviceType = () => {
      if (device.type) {
        return device.type;
      }

      // Fallback detection
      const ua = userAgent.toLowerCase();
      if (
        ua.includes("mobile") ||
        ua.includes("android") ||
        ua.includes("iphone")
      ) {
        return "mobile";
      } else if (ua.includes("tablet") || ua.includes("ipad")) {
        return "tablet";
      }
      return "desktop";
    };

    const deviceType = getDeviceType();

    // Build device info
    const deviceInfo = {
      browser: browser.name || "Unknown",
      browserVersion: browser.version || "Unknown",
      os: os.name || "Unknown",
      osVersion: os.version || "Unknown",
      deviceType: deviceType,
      deviceModel: device.model || "",
      deviceVendor: device.vendor || "",
      engineName: engine.name || "",
      engineVersion: engine.version || "",
      userAgent: userAgent,
      platform: platform,
      screenResolution: screenResolution,
      timezone: timezone,
      language: language,
      colorDepth: window.screen.colorDepth || 24,
      pixelDepth: window.screen.pixelDepth || 24,
    };

    // Create a consistent fingerprint string using key identifying features
    const fingerprintData = [
      deviceInfo.browser,
      deviceInfo.browserVersion,
      deviceInfo.os,
      deviceInfo.osVersion,
      deviceInfo.deviceType,
      deviceInfo.platform,
      deviceInfo.screenResolution,
      deviceInfo.timezone,
      deviceInfo.language,
      deviceInfo.colorDepth,
    ].join("|");

    // Generate hash of fingerprint data
    const encoder = new TextEncoder();
    const data = encoder.encode(fingerprintData);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const deviceFingerprint = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return {
      deviceFingerprint,
      deviceInfo,
    };
  } catch (error) {
    console.error("Error generating device fingerprint:", error);

    // Fallback fingerprint using basic browser APIs
    const fallbackInfo = {
      browser: "Unknown",
      browserVersion: "Unknown",
      os: "Unknown",
      osVersion: "Unknown",
      deviceType: "desktop",
      deviceModel: "",
      deviceVendor: "",
      engineName: "",
      engineVersion: "",
      userAgent: navigator.userAgent || "Unknown",
      platform: navigator.platform || "Unknown",
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown",
      language: navigator.language || "Unknown",
      colorDepth: window.screen.colorDepth || 24,
      pixelDepth: window.screen.pixelDepth || 24,
    };

    return {
      deviceFingerprint: `fallback_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`,
      deviceInfo: fallbackInfo,
    };
  }
};

// Function to check if current device matches a stored device fingerprint
export const isCurrentDevice = async (storedDeviceFingerprint) => {
  try {
    const { deviceFingerprint } = await generateDeviceFingerprint();
    return deviceFingerprint === storedDeviceFingerprint;
  } catch (error) {
    console.error("Error checking current device:", error);
    return false;
  }
};
