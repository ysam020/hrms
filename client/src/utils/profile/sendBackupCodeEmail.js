import apiClient from "../../config/axiosConfig";

export const sendEmail = async (setAlert) => {
  try {
    const res = await apiClient(`/send-backup-codes-email`);
    setAlert({
      open: true,
      message: res.data.message,
      severity: "success",
    });
  } catch (error) {
    console.error(error);
    setAlert({
      open: true,
      message: error.response.data.message,
      severity: "error",
    });
  }
};
