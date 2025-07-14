import apiClient from "../../config/axiosConfig";

export const deleteCodes = async (user, setUser, setAlert) => {
  try {
    const res = await apiClient.delete(`/delete-backup-codes`);

    if (res.data.message === "Backup codes deleted") {
      setUser({ ...user, backupCodes: [] });
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
};
