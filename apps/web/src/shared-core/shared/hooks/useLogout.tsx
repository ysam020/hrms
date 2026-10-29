import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient, {
  cancelAllPendingRequests,
  clearAccessToken,
} from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { clearFaviconDot } from "@web/shared/utils/faviconUtils";
import { clearStorageOnSignOut } from "@web/shared/utils/signOutStorage";

function useLogout(setUser) {
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Whatever the server said, this tab is signed out: no in-flight
  // requests, no access token in memory, no session data in storage
  // (device preferences and a paid-but-unfinished setup survive), and the
  // sign-in page — replacing the current entry, so Back can't return to a
  // signed-in screen.
  const endSession = useCallback(() => {
    cancelAllPendingRequests("logout");
    clearAccessToken();
    clearFaviconDot();
    clearStorageOnSignOut();
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate, setUser]);

  const performLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      // The server clears the refresh cookie; the tab signs out either way
      // (a refusal mustn't leave the person apparently still signed in).
      await apiClient(API_ENDPOINTS.LOGOUT, { withCredentials: true });
      endSession();
    } catch (error) {
      console.error("Error logging out:", error);
      endSession();
    } finally {
      setLoggingOut(false);
      setConfirmOpen(false);
    }
  }, [endSession]);

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
