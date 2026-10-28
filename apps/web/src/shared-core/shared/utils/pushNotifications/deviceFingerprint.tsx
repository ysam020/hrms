import { UAParser } from "ua-parser-js";

const DEVICE_ID_STORAGE_KEY = "hrms_device_id";

// A stable, persisted identifier for this browser profile — used as the
// dedup key when registering/removing FCM tokens (server-side keyed by
// deviceFingerprint, see registerFcmToken.ts/removeFcmToken.ts). Previously
// the fingerprint below was derived entirely from browser version, OS
// version, screen resolution, timezone, and language — several of which
// change for the exact same physical device (a browser auto-update bumping
// browserVersion being the most common case). That silently orphaned the
// old fcmTokens entry and registered a new one on every such change,
// accumulating duplicate/stale devices, and made "Enable on this device"
// incorrectly offer to re-enable a device that was already enrolled under
// the old, now-mismatched id. A random id persisted in localStorage doesn't
// have that problem — it only changes if the user clears site data.
function getOrCreateStableDeviceId(): string | null {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage unavailable (private browsing, storage disabled, etc.) —
    // no persistent identity is possible here anyway, so the caller falls
    // back to the UA-derived hash below.
    return null;
  }
}

export const generateDeviceFingerprint = async () => {
  try {
    const parser = new UAParser();
    const result = parser.getResult();

    const language = navigator.language || "Unknown";
    const timezone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Unknown";
    const screenResolution = `${window.screen.width}x${window.screen.height}`;
    const platform = navigator.platform || "Unknown";
    const userAgent = navigator.userAgent;

    const browser = result.browser;
    const os = result.os;
    const device = result.device;
    const engine = result.engine;

    const getDeviceType = () => {
      if (device.type) {
        return device.type;
      }

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

    const stableId = getOrCreateStableDeviceId();
    if (stableId) {
      return {
        deviceFingerprint: stableId,
        deviceInfo,
      };
    }

    // No persistent storage available — fall back to a UA-derived hash so
    // registration still works, just without stability across browser/OS
    // updates (matches the previous behavior of this function entirely).
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
      // Still prefer the stable persisted id here too — otherwise a device
      // that hits this catch (e.g. UAParser throws) gets a brand new random
      // id on every single call, never matching a previously-registered
      // entry at all.
      deviceFingerprint:
        getOrCreateStableDeviceId() ??
        `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      deviceInfo: fallbackInfo,
    };
  }
};

export const isCurrentDevice = async (storedDeviceFingerprint) => {
  try {
    const { deviceFingerprint } = await generateDeviceFingerprint();
    return deviceFingerprint === storedDeviceFingerprint;
  } catch (error) {
    console.error("Error checking current device:", error);
    return false;
  }
};
