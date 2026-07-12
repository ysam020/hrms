import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, {
  cancelAllPendingRequests,
} from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { clearFaviconDot } from "@web/shared/utils/faviconUtils";

function useLogout(setUser) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const performLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      const res = await apiClient(API_ENDPOINTS.LOGOUT, {
        withCredentials: true,
      });
      if (res.data.success) {
        cancelAllPendingRequests("logout");
        clearFaviconDot();

        const theme = localStorage.getItem("theme");
        localStorage.clear();
        if (theme) localStorage.setItem("theme", theme);

        // Reset user state and navigate
        setUser(null);
        navigate("/login", { replace: true });
      }
    } catch (error) {
      console.error("Error logging out:", error);
      clearFaviconDot();
      const theme = localStorage.getItem("theme");
      localStorage.clear();
      if (theme) localStorage.setItem("theme", theme);
      setUser(null);
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
      setConfirmOpen(false);
    }
  }, [navigate, setUser]);

  // Both the logout icon and the Cmd/Ctrl+Shift+L shortcut call this — it
  // only opens the confirmation dialog; performLogout runs after the user
  // explicitly confirms.
  const handleLogout = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const cancelLogout = useCallback(() => {
    if (loggingOut) return;
    setConfirmOpen(false);
  }, [loggingOut]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "l"
      ) {
        event.preventDefault();
        handleLogout();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleLogout]);

  return {
    handleLogout,
    confirmOpen,
    cancelLogout,
    confirmLogout: performLogout,
    loggingOut,
  };
}

export default useLogout;
