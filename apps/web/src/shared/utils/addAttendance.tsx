import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const FIELD_TO_TYPE: Record<string, string> = {
  timeIn: "CHECK_IN",
  timeOut: "CHECK_OUT",
};

const SUCCESS_MESSAGE: Record<string, string> = {
  timeIn: "Punched in successfully",
  timeOut: "Punched out successfully",
};

export const addAttendance = async (
  field,
  setAlert,
  getAttendances,
  latitude,
  longitude,
) => {
  try {
    await apiClient.post(API_ENDPOINTS.ADD_ATTENDANCE, {
      type: FIELD_TO_TYPE[field] ?? field,
      latitude,
      longitude,
    });

    setAlert({
      open: true,
      message: SUCCESS_MESSAGE[field] ?? "Attendance recorded successfully",
      severity: "success",
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
