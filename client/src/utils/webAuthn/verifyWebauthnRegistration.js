import apiClient from "../../config/axiosConfig";

export const verifyWebauthnRegistration = async (credential, setAlert) => {
  try {
    const res = await apiClient.post(`/webauthn-verify-registration`, {
      credential,
    });
    if (res.data.verified) {
      setAlert({
        open: true,
        message: "Registration successful!",
        severity: "success",
      });
    } else {
      setAlert({
        open: true,
        message: "Registration failed. Please try again.",
        severity: "error",
      });
    }
  } catch (error) {
    setAlert({
      open: true,
      message: error.response.data.message,
      severity: "error",
    });
  }
};
