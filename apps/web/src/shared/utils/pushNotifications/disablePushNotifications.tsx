import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { generateDeviceFingerprint } from "./deviceFingerprint";

export const disablePushNotifications = async (
  setAlert,
  disableAll = false,
) => {
  try {
    const requestData: { disableAll: boolean; deviceFingerprint?: string } = {
      disableAll,
    };

    if (!disableAll) {
      // Get current device fingerprint to disable only this device
      const { deviceFingerprint } = await generateDeviceFingerprint();
      requestData.deviceFingerprint = deviceFingerprint;
    }

    const res = await apiClient.delete(
      API_ENDPOINTS.DISABLE_PUSH_NOTIFICATIONS,
      {
        data: requestData,
      },
    );

    setAlert({
      open: true,
      message: res.data.message,
      severity: "success",
    });
  } catch (error) {
    setAlert({
      open: true,
      message:
        error.message === "Network Error"
          ? "Network Error, your details will be submitted when you are back online"
          : error.response?.data?.message || "An unexpected error occurred",
      severity: "error",
    });
  }
};
