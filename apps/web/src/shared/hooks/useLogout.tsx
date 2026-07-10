import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, {
  cancelAllPendingRequests,
} from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

function useLogout(setUser) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Clear favicon notification dot
  const clearFaviconDot = () => {
    const originalFavicon = "/favicon.ico";
    const canvas = document.createElement("canvas");
    const img = document.createElement("img");

    img.src = originalFavicon;
    img.onload = () => {
      const size = 32;
      canvas.width = size;
      canvas.height = size;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);

      const newFavicon = canvas.toDataURL("image/png");
      const link =
        document.querySelector<HTMLLinkElement>("link[rel='icon']") ||
        (document.createElement("link") as HTMLLinkElement);
      link.rel = "icon";
      link.href = newFavicon;
      document.head.appendChild(link);
    };

    // Also reset the document title
    document.title = "HRMS";
  };

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
