import "./App.scss";
import { useState, useMemo, useEffect, Suspense, lazy, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { flushSync } from "react-dom";
import DomMagnifier from "@web/shared/components/DomMagnifier";
import ProfilerOverlay from "@web/shared/components/ProfilerOverlay";
import {
  useLocation,
  useNavigate,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import apiClient, {
  performRefresh,
  getAccessToken,
  setAccessToken,
} from "@web/core/http/axiosConfig";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import Alert from "@mui/material/Alert";
import Loading from "@web/shared/components/Loading";
import ConfirmationDialog from "@web/shared/components/ConfirmationDialog";
import SubscriptionExpiredDialog from "@web/shared/components/SubscriptionExpiredDialog";
import useLogout from "@web/shared/hooks/useLogout";
import {
  setUnauthorizedHandler,
  setPaymentRequiredHandler,
} from "@web/core/http/axiosConfig";
import useNavigateWithKeyboard from "@web/shared/hooks/useNavigateWithKeyboard";
import useFullScreen from "@web/shared/hooks/useFullScreen";
import useProfiler from "@web/shared/hooks/useProfiler";
import useToggleSidebar from "@web/shared/hooks/useToggleSidebar";
import useBroadcastApi from "@web/shared/hooks/useBroadcastApi";
import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";
import ThemeProvider from "@mui/material/styles/ThemeProvider";
import useTheme from "@web/shared/hooks/useTheme";
import useMuiTheme from "@web/shared/hooks/useMuiTheme";
import usePrimeReactTheme from "@web/shared/hooks/usePrimeReactTheme";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { SocketProvider } from "@web/app/providers/SocketContext";
import { ChatUnreadProvider } from "@web/app/providers/ChatUnreadContext";
import { ApprovalsBadgeProvider } from "@web/app/providers/ApprovalsBadgeContext";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import { clearFaviconDot } from "@web/shared/utils/faviconUtils";
const HomePage = lazy(() => import("@web/pages/HomePage"));
const LoginPage = lazy(() => import("@web/features/auth/LoginPage"));
const OrgSetupPage = lazy(() => import("@web/features/auth/OrgSetupPage"));
const CareersPage = lazy(() => import("@web/pages/CareersPage"));
const JobApplicationPage = lazy(() => import("@web/pages/JobApplicationPage"));
const PrivacyPolicyPage = lazy(
  () => import("@web/pages/legal/PrivacyPolicyPage"),
);
const TermsOfUsePage = lazy(() => import("@web/pages/legal/TermsOfUsePage"));
const RefundPolicyPage = lazy(
  () => import("@web/pages/legal/RefundPolicyPage"),
);
const BroadcastModal = lazy(
  () => import("@web/features/layout/modals/BroadcastModal"),
);

function decodeTokenPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const userRef = useRef(user);
  userRef.current = user;
  const [booting, setBooting] = useState(true);
  const [pendingSetup, setPendingSetup] = useState(false);
  const [orgSetupPending, setOrgSetupPending] = useState(false);
  const [subscriptionExpiredModalOpen, setSubscriptionExpiredModalOpen] =
    useState(false);
  const { theme, toggleTheme } = useTheme();
  const muiTheme = useMuiTheme(theme);
  usePrimeReactTheme(theme);
  const [alert, setAlert] = useState<{
    open: boolean;
    message: string;
    severity: "error" | "info" | "success" | "warning";
  }>({
    open: false,
    message: "",
    severity: "info",
  });

  const {
    handleLogout,
    confirmOpen: logoutConfirmOpen,
    cancelLogout,
    confirmLogout,
    loggingOut,
  } = useLogout(setUser);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const theme = localStorage.getItem("theme");
      localStorage.clear();
      if (theme) localStorage.setItem("theme", theme);
      setUser(null);
      setPendingSetup(false);
      setOrgSetupPending(false);
    });
    setPaymentRequiredHandler(() => {
      if (hasSubscriptionAccess(userRef.current)) {
        navigate("/subscription");
      } else {
        setSubscriptionExpiredModalOpen(true);
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net for every path that can clear the session — explicit logout
  // already clears this itself, but session expiry (setUnauthorizedHandler
  // above) didn't, so a notification dot set before expiry could survive
  // indefinitely past the point where there's no one left to view it.
  useEffect(() => {
    if (!user) {
      clearFaviconDot();
      setSubscriptionExpiredModalOpen(false);
    }
  }, [user]);

  // Re-validate session when the page is restored from bfcache (back-forward
  // cache). Without this, stale auth state (user non-null from a prior session,
  // or the /login shell) would flash before the correct page renders.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // flushSync commits setBooting(true) to the DOM synchronously so the
      // stale cached content is never visible — even for a single frame.
      flushSync(() => setBooting(true));
      apiClient
        .get(API_ENDPOINTS.GET_PROFILE)
        .then((res) => {
          setUser(res.data?.success ? res.data.data.user : null);
          setBooting(false);
        })
        .catch((err) => {
          // A 401 here means the axios interceptor already tried refreshing
          // and the server still rejected it (or forceLogout already fired
          // via _onUnauthorized) — there's really no session. Anything else
          // (network error, timeout — this bypassed the interceptor's own
          // retry entirely since there's no response to react to) says
          // nothing about session validity, so don't clear a possibly-still-
          // valid user just because this one revalidation call had a blip.
          if ((err as any)?.response?.status === 401) {
            setUser(null);
          }
          setBooting(false);
        });
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture search params synchronously at component init — before Navigate's
  // useEffect can change the URL to /login (child effects run before parent effects).
  const initialSearch = useRef(location.search);

  // On every page load, silently exchange the HttpOnly refresh-token cookie
  // for a new access token (stored in memory only — never localStorage).
  // If the refresh fails the user has no valid session and sees the login page.
  // This is the standard production pattern: access token in memory,
  // refresh token in HttpOnly cookie.
  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams(initialSearch.current);
    if (params.get("oauth_success") === "1") {
      const oauthToken = params.get("access_token");
      if (oauthToken) setAccessToken(oauthToken);
      window.history.replaceState({}, "", window.location.pathname);
    }

    // Boot sequence: ensure we have a valid access token, then check its
    // payload. If pendingSetup === true the user has no tenant yet — send them
    // to /org-setup (which fetches their available tenants itself). Otherwise
    // fetch the profile and drop them into the app.
    const boot = async (isRetry = false) => {
      try {
        let token = getAccessToken();
        if (!token) {
          token = await performRefresh();
        }

        if (cancelled) return;

        const payload = decodeTokenPayload(token);
        if (payload?.pendingSetup) {
          // Mark pendingSetup before revealing routes so the /* catch-all
          // never fires a /login redirect during the navigation to /org-setup.
          setPendingSetup(true);
          if (window.location.pathname !== "/org-setup") {
            navigate("/org-setup", { replace: true });
          }
          setBooting(false);
          return;
        }

        if (payload?.tenantId && payload?.orgSetupComplete === false) {
          setOrgSetupPending(true);
          if (window.location.pathname !== "/org-setup") {
            navigate("/org-setup", {
              replace: true,
              state: { startAtStep: 2 },
            });
          }
          setBooting(false);
          return;
        }

        const res = await apiClient.get(API_ENDPOINTS.GET_PROFILE);
        if (cancelled) return;
        if (res.data?.success) setUser(res.data.data.user);
        setBooting(false);
      } catch (err) {
        if (cancelled) return;
        // A 401 here means the server actively rejected the refresh token or
        // the profile request — there really is no session to recover.
        // Anything else (aborted request, network blip, transient 5xx) says
        // nothing about whether the session is valid, so treating the first
        // hiccup as "logged out" is what forces a hard refresh after Google
        // sign-in (a service-worker-triggered reload can abort this exact
        // sequence, see watchForServiceWorkerUpdates) or after an ordinary
        // page refresh. Give it one bounded retry before actually giving up.
        const isDefiniteAuthFailure = (err as any)?.response?.status === 401;
        if (!isRetry && !isDefiniteAuthFailure) {
          setTimeout(() => {
            if (!cancelled) boot(true);
          }, 800);
          return;
        }
        setBooting(false);
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [showSidebar, setShowSidebar] = useState(true);
  const [broadcastModal, setBroadcastModal] = useState(false);
  const channel = useMemo(() => new BroadcastChannel("app-tabs"), []);
  useNavigateWithKeyboard();
  useFullScreen();
  useToggleSidebar(setShowSidebar);
  const handleUseInThisTab = useBroadcastApi(channel, setBroadcastModal);

  const [magnifierOn, setMagnifierOn] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.code === "KeyM") setMagnifierOn((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const {
    isActive: profilerActive,
    lastTrace: profilerTrace,
    toggle: toggleProfiler,
    cancel: cancelProfiler,
    clear: clearProfiler,
    supported: profilerSupported,
  } = useProfiler();
  useEffect(() => {
    if (!profilerSupported) return;
    const onKey = (e) => {
      if (e.altKey && e.code === "KeyP") toggleProfiler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleProfiler, profilerSupported]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (magnifierOn) setMagnifierOn(false);
      if (profilerActive) cancelProfiler();
      else if (profilerTrace) clearProfiler();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    magnifierOn,
    profilerActive,
    profilerTrace,
    cancelProfiler,
    clearProfiler,
  ]);

  const userContextValue = useMemo(
    () => ({ user, setUser, handleLogout }),
    [user, handleLogout],
  );
  const alertContextValue = useMemo(() => ({ alert, setAlert }), [alert]);

  useEffect(() => {
    if (alert.open) {
      const duration =
        alert.severity === "error"
          ? 6000
          : alert.severity === "warning"
            ? 5000
            : 3000;
      const timer = setTimeout(() => {
        setAlert((prev) => ({ ...prev, open: false }));
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ThemeProvider theme={muiTheme}>
        <UserContext.Provider value={userContextValue}>
          <AlertContext.Provider value={alertContextValue}>
            <div className="App" id={theme}>
              {booting ? (
                <Loading />
              ) : (
                <Routes>
                  <Route
                    path="/login"
                    element={
                      user ? (
                        <Navigate
                          to={location.state?.from?.pathname || "/"}
                          replace
                        />
                      ) : (
                        <ErrorBoundary FallbackComponent={ErrorFallback}>
                          <Suspense fallback={<Loading />}>
                            <LoginPage />
                          </Suspense>
                        </ErrorBoundary>
                      )
                    }
                  />
                  <Route
                    path="/org-setup"
                    element={
                      user ? (
                        <Navigate to="/" replace />
                      ) : (
                        <ErrorBoundary FallbackComponent={ErrorFallback}>
                          <Suspense fallback={<Loading />}>
                            <OrgSetupPage />
                          </Suspense>
                        </ErrorBoundary>
                      )
                    }
                  />
                  <Route
                    path="/careers/:slug"
                    element={
                      <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                          <CareersPage />
                        </Suspense>
                      </ErrorBoundary>
                    }
                  />
                  <Route
                    path="/careers/:slug/apply/:id"
                    element={
                      <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                          <JobApplicationPage />
                        </Suspense>
                      </ErrorBoundary>
                    }
                  />
                  {/* Public legal pages — accessible whether logged in or
                      not, no auth gate, same as /careers. */}
                  <Route
                    path="/privacy-policy"
                    element={
                      <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                          <PrivacyPolicyPage />
                        </Suspense>
                      </ErrorBoundary>
                    }
                  />
                  <Route
                    path="/terms-of-use"
                    element={
                      <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                          <TermsOfUsePage />
                        </Suspense>
                      </ErrorBoundary>
                    }
                  />
                  <Route
                    path="/refund-policy"
                    element={
                      <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                          <RefundPolicyPage />
                        </Suspense>
                      </ErrorBoundary>
                    }
                  />
                  <Route
                    path="/*"
                    element={
                      user ? (
                        <SocketProvider>
                          <ChatUnreadProvider>
                            <ApprovalsBadgeProvider>
                              <ErrorBoundary FallbackComponent={ErrorFallback}>
                                <Suspense fallback={<Loading />}>
                                  <HomePage
                                    showSidebar={showSidebar}
                                    setShowSidebar={setShowSidebar}
                                  />
                                </Suspense>
                              </ErrorBoundary>
                            </ApprovalsBadgeProvider>
                          </ChatUnreadProvider>
                        </SocketProvider>
                      ) : pendingSetup ? (
                        <Navigate to="/org-setup" replace />
                      ) : orgSetupPending ? (
                        <Navigate
                          to="/org-setup"
                          state={{ startAtStep: 2 }}
                          replace
                        />
                      ) : (
                        <Navigate
                          to="/login"
                          state={{ from: location }}
                          replace
                        />
                      )
                    }
                  />
                </Routes>
              )}
              <div
                className="alert-container"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                <AnimatePresence>
                  {alert.open && (
                    <motion.div
                      key={alert.message}
                      initial={{ opacity: 0, y: -16, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -12, scale: 0.96 }}
                      transition={{
                        type: "spring",
                        stiffness: 380,
                        damping: 26,
                      }}
                      style={{
                        position: "fixed",
                        top: "20px",
                        right: "20px",
                        zIndex: 9999,
                        minWidth: "200px",
                        maxWidth: "400px",
                      }}
                    >
                      <Alert
                        severity={alert.severity}
                        variant="filled"
                        onClose={() => setAlert({ ...alert, open: false })}
                        sx={{ boxShadow: "0 4px 20px rgba(0,0,0,0.25)" }}
                      >
                        {alert.message}
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <DomMagnifier enabled={magnifierOn} />
              <ProfilerOverlay
                isActive={profilerActive}
                lastTrace={profilerTrace}
                onClose={clearProfiler}
              />
              {broadcastModal && (
                <ErrorBoundary FallbackComponent={ErrorFallback}>
                  <Suspense fallback={null}>
                    <BroadcastModal
                      open={broadcastModal}
                      handleClose={() => setBroadcastModal(false)}
                      handleUseInThisTab={handleUseInThisTab}
                    />
                  </Suspense>
                </ErrorBoundary>
              )}
              {/* Never render on /login — there's nothing to confirm logging
                  out of there, and confirmOpen can still be stale-true if a
                  session expired mid-confirmation on another page. */}
              {location.pathname !== "/login" && (
                <ConfirmationDialog
                  open={logoutConfirmOpen}
                  onClose={cancelLogout}
                  onConfirm={confirmLogout}
                  title="Log out"
                  message="Are you sure you want to log out?"
                  confirmText="Log out"
                  cancelText="Cancel"
                  loading={loggingOut}
                  variant="danger"
                  theme={theme}
                  autoFocusConfirm
                />
              )}
              <SubscriptionExpiredDialog
                open={subscriptionExpiredModalOpen}
                onLogout={handleLogout}
                theme={theme}
              />
            </div>
          </AlertContext.Provider>
        </UserContext.Provider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

export default App;
