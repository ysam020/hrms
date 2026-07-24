import { useCallback, useContext, useRef, useState } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

// The popup navigates to Google, then to our backend's callback route,
// which posts back here — that's the API origin, not necessarily the
// frontend's own origin (they can be different subdomains), so the
// message-origin check below has to compare against VITE_SERVER_URL, not
// window.location.origin.
const API_ORIGIN = (() => {
  try {
    return new URL(import.meta.env.VITE_SERVER_URL || window.location.origin)
      .origin;
  } catch {
    return window.location.origin;
  }
})();

// How often to check whether the popup has closed yet.
const POLL_INTERVAL_MS = 500;

/**
 * Drives the "Connect Google Calendar" popup flow triggered when scheduling
 * or rescheduling an interview hits a CALENDAR_NOT_CONNECTED response.
 * Opens Google's consent screen in a popup (not a full-page redirect) so
 * the calling form's state — whatever the user already typed — is never
 * lost; the original submission is retried automatically once connected.
 *
 * The popup can't reliably report back via window.opener/postMessage —
 * accounts.google.com sets its own Cross-Origin-Opener-Policy header, which
 * permanently severs window.opener the moment the popup navigates there, a
 * well-known limitation of "connect via Google" popup flows in general (see
 * popupResultPage in the backend's auth.ts handler). The postMessage
 * listener below is kept as a fast-path for the cases where it does still
 * work, but the reliable mechanism is polling: once the popup closes
 * (whether it closed itself or the user closed it), ask the backend
 * directly whether the connection actually succeeded.
 */
export function useConnectGoogleCalendar() {
  const { setAlert } = useContext(AlertContext);
  const [promptOpen, setPromptOpen] = useState(false);
  const pendingRetry = useRef<(() => void) | null>(null);

  const requestConnect = useCallback((retry: () => void) => {
    pendingRetry.current = retry;
    setPromptOpen(true);
  }, []);

  const closePrompt = useCallback(() => {
    setPromptOpen(false);
    pendingRetry.current = null;
  }, []);

  const startConnectFlow = useCallback(async () => {
    try {
      const res = await apiClient.get(API_ENDPOINTS.GOOGLE_CALENDAR_CONNECT);
      const url = res.data?.data?.url;
      if (!url) throw new Error("No authorize URL returned");

      const popup = window.open(
        url,
        "connect-google-calendar",
        "width=520,height=650",
      );
      if (!popup) {
        setAlert({
          open: true,
          message:
            "Your browser blocked the Google sign-in popup. Please allow popups for this site and try again.",
          severity: "error",
        });
        return;
      }

      // Guards against firing the success/failure handling twice if both
      // the message event and the closed-popup poll end up resolving.
      let settled = false;

      const succeed = () => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", handleMessage);
        clearInterval(pollId);
        setPromptOpen(false);
        const retry = pendingRetry.current;
        pendingRetry.current = null;
        setAlert({
          open: true,
          message: "Google Calendar connected.",
          severity: "success",
        });
        retry?.();
      };

      const fail = (message?: string) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", handleMessage);
        clearInterval(pollId);
        if (message) {
          setAlert({ open: true, message, severity: "error" });
        }
      };

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== API_ORIGIN) return;
        if (event.data?.type === "google-calendar-connected") {
          succeed();
        } else if (event.data?.type === "google-calendar-error") {
          fail(
            event.data?.message ||
              "Google Calendar connection failed. Please try again.",
          );
        }
      };
      window.addEventListener("message", handleMessage);

      const pollId = window.setInterval(async () => {
        if (settled || !popup.closed) return;
        clearInterval(pollId);
        try {
          const statusRes = await apiClient.get(
            API_ENDPOINTS.GOOGLE_CALENDAR_STATUS,
          );
          if (statusRes.data?.data?.connected) {
            succeed();
          } else {
            // Popup closed without connecting — most likely the user
            // cancelled partway through. No error toast: they can just
            // click Connect again from the still-open prompt.
            fail();
          }
        } catch {
          fail();
        }
      }, POLL_INTERVAL_MS);
    } catch (err: any) {
      setAlert({
        open: true,
        message:
          err.response?.data?.message ||
          "Could not start the Google Calendar connection. Please try again.",
        severity: "error",
      });
    }
  }, [setAlert]);

  return { promptOpen, requestConnect, startConnectFlow, closePrompt };
}
