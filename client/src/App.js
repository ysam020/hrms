import "./App.scss";
import React, { useState, useMemo, useEffect, Suspense } from "react";
import { ThemeContext } from "./contexts/ThemeContext.js";
import { AlertContext } from "./contexts/AlertContext.js";
import { UserContext } from "./contexts/UserContext.js";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import useUserVerification from "./hooks/useUserVerification";
import useLogout from "./hooks/useLogout";
import useSpotlightModal from "./hooks/useSpotlightModal";
import useNavigateWithKeyboard from "./hooks/useNavigateWithKeyboard";
import useFullScreen from "./hooks/useFullScreen.js";
import useToggleSidebar from "./hooks/useToggleSidebar.js";
import useBroadcastApi from "./hooks/useBroadcastApi.js";
import { ThemeProvider } from "@mui/material/styles";
import useTheme from "./hooks/useTheme.js";
import useMuiTheme from "./hooks/useMuiTheme.js";
import ErrorFallback from "./components/customComponents/ErrorFallback.js";
import { ErrorBoundary } from "react-error-boundary";
import Loading from "./components/customComponents/Loading.js";
const HomePage = React.lazy(() => import("./pages/HomePage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const SpotlightModal = React.lazy(() => import("./modals/SpotlightModal"));
const BroadcastModal = React.lazy(() => import("./modals/BroadcastModal"));

function App() {
  const [user, setUser] = useState();
  const { theme, toggleTheme } = useTheme();
  const muiTheme = useMuiTheme(theme);
  const [alert, setAlert] = useState({
    open: false,
    message: "",
    severity: "",
  });

  const handleLogout = useLogout(setUser);
  const [showSidebar, setShowSidebar] = useState(true);
  const [broadcastModal, setBroadcastModal] = useState(false);
  const channel = useMemo(() => new BroadcastChannel("app-tabs"), []);
  const { open, handleOpen, handleClose } = useSpotlightModal(user);
  const loading = useUserVerification(setUser);
  useNavigateWithKeyboard();
  useFullScreen();
  useToggleSidebar(setShowSidebar);
  const handleUseInThisTab = useBroadcastApi(channel, setBroadcastModal);

  const userContextValue = useMemo(
    () => ({ user, setUser, handleLogout }),
    [user, handleLogout]
  );
  const alertContextValue = useMemo(() => ({ alert, setAlert }), [alert]);

  useEffect(() => {
    if (alert.open) {
      const timer = setTimeout(() => {
        setAlert({ ...alert, open: false });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [alert]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <ThemeProvider theme={muiTheme}>
        <UserContext.Provider value={userContextValue}>
          <AlertContext.Provider value={alertContextValue}>
            <div className="App" id={theme}>
              {loading ? (
                <Loading />
              ) : user ? (
                <Suspense fallback={<Loading />}>
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <HomePage
                      showSidebar={showSidebar}
                      setShowSidebar={setShowSidebar}
                    />
                  </ErrorBoundary>
                </Suspense>
              ) : (
                <Suspense fallback={<CircularProgress />}>
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <LoginPage />
                  </ErrorBoundary>
                </Suspense>
              )}
            </div>

            <Suspense fallback={<CircularProgress />}>
              <ErrorBoundary fallback={<ErrorFallback />}>
                <SpotlightModal
                  open={open}
                  handleOpen={handleOpen}
                  handleClose={handleClose}
                />
              </ErrorBoundary>
            </Suspense>

            <Suspense fallback={<CircularProgress />}>
              <ErrorBoundary fallback={<ErrorFallback />}>
                <BroadcastModal
                  open={broadcastModal}
                  handleUseInThisTab={handleUseInThisTab}
                  handleClose={(event, reason) => {
                    if (reason !== "backdropClick") {
                      setBroadcastModal(false);
                    }
                  }}
                />
              </ErrorBoundary>
            </Suspense>

            {alert.open && (
              <Alert severity={alert.severity}>{alert.message}</Alert>
            )}
          </AlertContext.Provider>
        </UserContext.Provider>
      </ThemeProvider>
    </ThemeContext.Provider>
  );
}

export default React.memo(App);
