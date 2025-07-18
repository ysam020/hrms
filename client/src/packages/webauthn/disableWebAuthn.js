import apiClient from "../../config/axiosConfig";

export async function disableWebAuthn(setAlert) {
  try {
    const res = await apiClient(`/disable-webauthn`);

    setAlert({
      open: true,
      message: res.data.message,
      severity: "success",
    });
  } catch (error) {
    setAlert({
      open: true,
      message: error.response.data.message,
      severity: "error",
    });
  }
}
