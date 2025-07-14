import apiClient from "../config/axiosConfig";

export const addAttendance = async (
  field,
  setAlert,
  getAttendances,
  latitude,
  longitude
) => {
  try {
    await apiClient.post(`/add-attendance`, {
      field,
      latitude,
      longitude,
    });

    getAttendances();
  } catch (error) {
    const message = error?.response?.data?.error;

    setAlert({
      open: true,
      message,
      severity: "error",
    });
  }
};
