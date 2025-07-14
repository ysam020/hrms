import apiClient from "../../config/axiosConfig";

export async function disableTwoFactor(setIsTwoFactorEnabled, setAlert) {
  try {
    const res = await apiClient.delete(`/disable-two-factor`);

    if (res.data.message === "Two factor authentication disabled") {
      setIsTwoFactorEnabled(false);
    } else {
      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });
    }
  } catch (error) {
    setAlert({
      open: true,
      message:
        error.message === "Network Error"
          ? "Network Error, your details will be submitted when you are back online"
          : error.response.data.message,
      severity: "error",
    });
  }
}
