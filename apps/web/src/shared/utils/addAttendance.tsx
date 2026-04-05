import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

export const addAttendance = async (
  field,
  setAlert,
  getAttendances,
  latitude,
  longitude,
) => {
  try {
    await apiClient.post(API_ENDPOINTS.ADD_ATTENDANCE, {
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
