import "./App.scss";
import React, { useState, useMemo, useEffect, Suspense } from "react";
import DomMagnifier from "@web/shared/components/DomMagnifier";
import ProfilerOverlay from "@web/shared/components/ProfilerOverlay";
import {
  useLocation,
  useNavigate,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import apiClient from "@web/core/http/axiosConfig";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import Alert from "@mui/material/Alert";
import Loading from "@web/shared/components/Loading";
import useLogout from "@web/shared/hooks/useLogout";
import { useSwUpdate } from "@web/shared/hooks/useSwUpdate";
import { setUnauthorizedHandler } from "@web/core/http/axiosConfig";
import useNavigateWithKeyboard from "@web/shared/hooks/useNavigateWithKeyboard";
import useFullScreen from "@web/shared/hooks/useFullScreen";
import useProfiler from "@web/shared/hooks/useProfiler";
import useToggleSidebar from "@web/shared/hooks/useToggleSidebar";
import useBroadcastApi from "@web/shared/hooks/useBroadcastApi";
import ThemeProvider from "@mui/material/styles/ThemeProvider";
import useTheme from "@web/shared/hooks/useTheme";
import useMuiTheme from "@web/shared/hooks/useMuiTheme";
import usePrimeReactTheme from "@web/shared/hooks/usePrimeReactTheme";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { SocketProvider } from "@web/app/providers/SocketContext";
import { ChatUnreadProvider } from "@web/app/providers/ChatUnreadContext";
const HomePage = React.lazy(() => import("@web/pages/HomePage"));
const LoginPage = React.lazy(() => import("@web/features/auth/LoginPage"));
const CareersPage = React.lazy(() => import("@web/pages/CareersPage"));
const JobApplicationPage = React.lazy(
  () => import("@web/pages/JobApplicationPage"),
);
const BroadcastModal = React.lazy(
  () => import("@web/features/layout/modals/BroadcastModal"),
);

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
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

  const handleLogout = useLogout(setUser);
  const { updateAvailable, triggerUpdate } = useSwUpdate();

  useEffect(() => {
    setUnauthorizedHandler(() => {
      const theme = localStorage.getItem("theme");
      localStorage.clear();
      if (theme) localStorage.setItem("theme", theme);
      setUser(null);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-validate session when the page is restored from bfcache (back-forward
  // cache). Without this, stale auth state (user non-null from a prior session,
  // or the /login shell) would flash before the correct page renders.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      setBooting(true);
      apiClient
        .get("/profile")
        .then((res) => {
          setUser(res.data?.success ? res.data.data.user : null);
        })
        .catch(() => setUser(null))
        .finally(() => setBooting(false));
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Capture search params synchronously at component init — before Navigate's
  // useEffect can change the URL to /login (child effects run before parent effects).
  const initialSearch = React.useRef(location.search);

  // On every page load, restore the session. The access token is read from
  // localStorage synchronously at module load, so /profile has a token
  // attached immediately — no async boot step needed.
  // Also handles the ?oauth_success=1 redirect from Google OAuth.
  useEffect(() => {
    const params = new URLSearchParams(initialSearch.current);
    if (params.get("oauth_success") === "1") {
      window.history.replaceState({}, "", window.location.pathname);
    }

    apiClient
      .get("/profile")
      .then((res) => {
        if (res.data?.success) {
          setUser(res.data.data.user);
        }
      })
      .catch(() => {
        // No valid token or session — user will see login page.
      })
      .finally(() => {
        setBooting(false);
      });
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
                    path="/careers"
                    element={
                      <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                          <CareersPage />
                        </Suspense>
                      </ErrorBoundary>
                    }
                  />
                  <Route
                    path="/careers/apply/:id"
                    element={
                      <ErrorBoundary FallbackComponent={ErrorFallback}>
                        <Suspense fallback={<Loading />}>
                          <JobApplicationPage />
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
                            <ErrorBoundary FallbackComponent={ErrorFallback}>
                              <Suspense fallback={<Loading />}>
                                <HomePage
                                  showSidebar={showSidebar}
                                  setShowSidebar={setShowSidebar}
                                />
                              </Suspense>
                            </ErrorBoundary>
                          </ChatUnreadProvider>
                        </SocketProvider>
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
                <Alert
                  severity={alert.severity}
                  variant="filled"
                  onClose={() => setAlert({ ...alert, open: false })}
                  sx={{
                    display: alert.open ? "flex" : "none",
                    position: "fixed",
                    top: "20px",
                    right: "20px",
                    zIndex: 9999,
                    minWidth: "200px",
                    maxWidth: "400px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                  }}
                >
                  {alert.message}
                </Alert>

                {updateAvailable && (
                  <Alert
                    severity="info"
                    variant="filled"
                    action={
                      <span
                        onClick={triggerUpdate}
                        style={{
                          cursor: "pointer",
                          fontWeight: 600,
                          textDecoration: "underline",
                        }}
                      >
                        Refresh
                      </span>
                    }
                    sx={{
                      position: "fixed",
                      bottom: "20px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      zIndex: 9999,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    A new version is available.
                  </Alert>
                )}
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
            </div>
          </AlertContext.Provider>
        </UserContext.Provider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

export default App;
