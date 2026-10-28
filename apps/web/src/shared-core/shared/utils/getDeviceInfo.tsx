import { UAParser } from "ua-parser-js";

export const getDeviceInfo = (item) => {
  const parser = new UAParser(item?.userAgent);
  const browser = parser.getBrowser().name || "";
  const os = parser.getOS().name || "";
  const device = parser.getDevice();
  const deviceName = device.type || "Desktop";
  const deviceModel = device.model || "";
  const deviceVendor = device.vendor || "";

  const combinedDeviceInfo = deviceName
    ? `${deviceName}${browser ? ` (${browser})` : ""}${os ? ` - ${os}` : ""}${
        deviceModel ? ` - ${deviceModel}` : ""
      }${deviceVendor ? ` - ${deviceVendor}` : ""}`
    : "Unknown Device";

  return combinedDeviceInfo;
};
