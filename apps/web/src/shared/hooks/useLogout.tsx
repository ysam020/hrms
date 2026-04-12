import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, {
  cancelAllPendingRequests,
} from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

function useLogout(setUser) {
  const navigate = useNavigate();

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

  const handleLogout = useCallback(async () => {
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
      setUser(null);
      navigate("/login", { replace: true });
    }
  }, [navigate, setUser]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key === "l"
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

  return handleLogout;
}

export default useLogout;
