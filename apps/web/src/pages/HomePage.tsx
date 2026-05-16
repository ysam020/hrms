import React, {
  useState,
  useContext,
  Suspense,
  useEffect,
  useMemo,
} from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import Toolbar from "@mui/material/Toolbar";
import { Route, Routes } from "react-router-dom";
import { TabValueContext } from "@web/app/providers/TabValueContext";
import AppbarComponent from "@web/features/layout/AppbarComponent";
import { DashboardEditProvider } from "@web/app/providers/DashboardEditContext";
import DrawerComponent from "@web/features/layout/DrawerComponent";
import routesConfig from "@web/app/router/routesConfig";
import { UserContext } from "@web/app/providers/UserContext";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import useNotifications from "@web/shared/hooks/useNotifications";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { refreshFcmToken } from "@web/shared/utils/pushNotifications/refreshFcmToken";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import LoadingState from "@web/shared/components/LoadingState";
import useSpotlightModal from "@web/shared/hooks/useSpotlightModal";
import GlobalDock from "@web/features/dashboard/GlobalDock";
import { BottomDrawerProvider } from "@web/app/providers/BottomDrawerContext";

const ChatbotFab = React.lazy(() => import("@web/features/chatbot/Chatbot"));

const UnAuthorisedRoute = React.lazy(
  () => import("@web/app/router/UnAuthorisedRoute"),
);
const Tour = React.lazy(() => import("@web/features/layout/Tour"));
const ActivityDrawer = React.lazy(
  () => import("@web/features/layout/AuditLogs"),
);
const NotificationDrawer = React.lazy(
  () => import("@web/features/layout/NotificationDrawer"),
);
const NotificationConsentDrawer = React.lazy(
  () => import("@web/shared/components/NotificationConsentDrawer"),
);
const SpotlightModal = React.lazy(
  () => import("@web/features/layout/modals/SpotlightModal"),
);

const drawerWidth = 60;

function HomePage(props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  const [run, setRun] = useState(false);
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);
  const { user } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);
  const { setAlert } = useContext(AlertContext);
  const { notifications, setNotifications, loading, setLoading } =
    useNotifications();
  const { open, handleOpen, handleClose } = useSpotlightModal(user);

  const filteredRoutes = useMemo(() => routesConfig(), []);

  const notificationContextValue = useMemo(
    () => ({
      notifications,
      setNotifications,
      loading,
      setLoading,
    }),
    [notifications, setNotifications, loading, setLoading],
  );

  const tabValueContextValue = useMemo(
    () => ({ tabValue, setTabValue }),
    [tabValue],
  );

  const mainBoxStyles = useMemo(
    () => ({
      flexGrow: 1,
      width: { md: `calc(100% - ${drawerWidth}px)` },
      backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
      height: "100vh",
      overflow: "hidden",
      padding: 0,
    }),
    [theme],
  );

  const fcmRefreshed = React.useRef(false);
  useEffect(() => {
    // Only run once per session — user object reference changes on every profile
    // update, which would otherwise re-trigger the consent drawer each time.
    if (user && user.fcmTokens !== undefined && !fcmRefreshed.current) {
      fcmRefreshed.current = true;
      refreshFcmToken(setShowConsentDrawer, setAlert, user.fcmTokens);
    }
  }, [user]);

  const [openActivityDrawer, setOpenActivityDrawer] = React.useState(false);
  const [openNotificationDrawer, setOpenNotificationDrawer] =
    React.useState(false);

  const toggleActivityDrawer = (isOpen) => (event) => {
    if (
      event.type === "keydown" &&
      (event.key === "Tab" || event.key === "Shift")
    ) {
      return;
    }
    setOpenActivityDrawer(isOpen);
  };

  const toggleNotificationDrawer = (isOpen) => (event) => {
    if (
      event.type === "keydown" &&
      (event.key === "Tab" || event.key === "Shift")
    ) {
      return;
    }
    setOpenNotificationDrawer(isOpen);
  };

  return (
    <BottomDrawerProvider>
      <DashboardEditProvider>
        <NotificationContext.Provider value={notificationContextValue}>
          <TabValueContext.Provider value={tabValueContextValue}>
            <Suspense fallback={null}>
              <ErrorBoundary fallback={<ErrorFallback />}>
                <Tour run={run} setRun={setRun} />
              </ErrorBoundary>
            </Suspense>
            <Box
              sx={{
                display: "flex",
                bgcolor: theme === "light" ? "#F9FAFB" : "#111B21",
              }}
            >
              <CssBaseline />
              <ErrorBoundary fallback={<ErrorFallback />}>
                <AppbarComponent
                  mobileOpen={mobileOpen}
                  setMobileOpen={setMobileOpen}
                  showSidebar={props.showSidebar}
                  setRun={setRun}
                  setOpenNotificationDrawer={setOpenNotificationDrawer}
                  setOpenActivityDrawer={setOpenActivityDrawer}
                  handleOpen={handleOpen}
                />
              </ErrorBoundary>

              {props.showSidebar && (
                <ErrorBoundary fallback={<ErrorFallback />}>
                  <DrawerComponent
                    mobileOpen={mobileOpen}
                    setMobileOpen={setMobileOpen}
                  />
                </ErrorBoundary>
              )}

              {/* Content */}
              <Box component="main" sx={mainBoxStyles}>
                <Toolbar />

                {/* Fixed-height scrollable viewport: 100vh - AppBar(64px) - Dock(72px) */}
                <Box
                  sx={{
                    height: "calc(100vh - 64px - 72px)",
                    overflowY: "auto",
                    overflowX: "hidden",
                    paddingTop: "10px",
                  }}
                >
                  <Routes>
                    {filteredRoutes
                      .filter((r) => !r.spotlightOnly)
                      .map(({ path, element, allowedModules }, index) => (
                        <Route
                          key={index}
                          path={path}
                          element={
                            allowedModules.length === 0 ? (
                              element
                            ) : (
                              <Suspense
                                fallback={<LoadingState size="small" />}
                              >
                                <ErrorBoundary fallback={<ErrorFallback />}>
                                  {element}
                                </ErrorBoundary>
                              </Suspense>
                            )
                          }
                        />
                      ))}
                    <Route
                      path="*"
                      element={
                        <Suspense fallback={<LoadingState size="small" />}>
                          <ErrorBoundary fallback={<ErrorFallback />}>
                            <UnAuthorisedRoute />
                          </ErrorBoundary>
                        </Suspense>
                      }
                    />
                  </Routes>
                </Box>

                <Suspense fallback={null}>
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <ActivityDrawer
                      open={openActivityDrawer}
                      setOpen={setOpenActivityDrawer}
                      toggleDrawer={toggleActivityDrawer}
                    />
                  </ErrorBoundary>
                </Suspense>

                <Suspense fallback={null}>
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <NotificationDrawer
                      open={openNotificationDrawer}
                      setOpen={setOpenNotificationDrawer}
                      toggleDrawer={toggleNotificationDrawer}
                    />
                  </ErrorBoundary>
                </Suspense>
              </Box>
            </Box>

            <NotificationConsentDrawer
              showConsentDrawer={showConsentDrawer}
              setShowConsentDrawer={setShowConsentDrawer}
              setAlert={setAlert}
            />
            <GlobalDock />
            <Suspense fallback={null}>
              <ErrorBoundary fallback={null}>
                <ChatbotFab />
              </ErrorBoundary>
            </Suspense>
          </TabValueContext.Provider>

          <Suspense fallback={<LoadingState />}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <SpotlightModal open={open} handleClose={handleClose} />
            </ErrorBoundary>
          </Suspense>
        </NotificationContext.Provider>
      </DashboardEditProvider>
    </BottomDrawerProvider>
  );
}

export default React.memo(HomePage);
