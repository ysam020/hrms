import apiClient from "../../config/axiosConfig";

export const logOutFromAllSessions = async (setUser, navigate, setAlert) => {
  try {
    const res = await apiClient(`/logout-from-all-sessions`);

    if (res.data.message === "Success") {
      setUser(null);
      navigate("/");
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
      message: error.response.data.message,
      severity: "error",
    });
  }
};
