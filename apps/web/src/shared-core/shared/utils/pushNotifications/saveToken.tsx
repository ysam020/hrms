import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

export const saveToken = async (
  token,
  deviceFingerprint,
  deviceInfo,
  setAlert,
) => {
  try {
    await apiClient.put(API_ENDPOINTS.SAVE_FCM_TOKEN, {
      fcmToken: token,
      deviceFingerprint,
      deviceInfo,
    });
  } catch (error) {
    console.error(error);

    if (setAlert) {
      setAlert({
        open: true,
        message:
          error.message === "Network Error"
            ? "Network Error, your details will be submitted when you are back online"
            : error.response?.data?.message || "An unexpected error occurred",
        severity: "error",
      });
    }
  }
};
