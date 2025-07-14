import apiClient from "../../config/axiosConfig";

// Save FCM token
export const saveToken = async (token, setAlert) => {
  try {
    await apiClient.put(`/save-fcm-token`, { fcmToken: token });
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
