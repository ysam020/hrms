import { UAParser } from "ua-parser-js";

export const getDeviceInfo = (userAgent) => {
  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const browser = result.browser.name || "Unknown Browser";
  const browserVersion = result.browser.version || "";
  const os = result.os.name || "Unknown OS";
  const osVersion = result.os.version || "";
  const deviceType = result.device.type || "desktop";
  const deviceModel = result.device.model || "";
  const deviceVendor = result.device.vendor || "";

  // Create a comprehensive device description
  const parts: string[] = [];

  // Add device info if available
  if (deviceVendor && deviceModel) {
    parts.push(`${deviceVendor} ${deviceModel}`);
  } else if (deviceModel) {
    parts.push(deviceModel);
  }

  // Add browser info
  if (browser !== "Unknown Browser") {
    const browserPart = browserVersion
      ? `${browser} ${browserVersion.split(".")[0]}`
      : browser;
    parts.push(browserPart);
  }

  // Add OS info
  if (os !== "Unknown OS") {
    const osPart = osVersion ? `${os} ${osVersion}` : os;
    parts.push(osPart);
  }

  // Add device type if no other specific info
  if (parts.length === 0) {
    parts.push(deviceType.charAt(0).toUpperCase() + deviceType.slice(1));
  }

  return parts.join(" • ") || "Unknown Device";
};
