import {
  Suspense,
  lazy,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import Toolbar from "@mui/material/Toolbar";
import { Route, Routes, useLocation } from "react-router-dom";
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
import { BottomDrawerProvider } from "@web/app/providers/BottomDrawerContext";

const ChatbotFab = lazy(() => import("@web/features/chatbot/Chatbot"));
const OnboardingModals = lazy(
  () => import("@web/features/onboarding/OnboardingModals"),
);

const UnAuthorisedRoute = lazy(
  () => import("@web/app/router/UnAuthorisedRoute"),
);
const ActivityDrawer = lazy(() => import("@web/features/layout/AuditLogs"));
const NotificationDrawer = lazy(
  () => import("@web/features/layout/NotificationDrawer"),
);
const NotificationConsentDrawer = lazy(
  () => import("@web/shared/components/NotificationConsentDrawer"),
);
const SpotlightModal = lazy(
  () => import("@web/features/layout/modals/SpotlightModal"),
);

const drawerWidth = 60;

function HomePage(props) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);
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
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      padding: 0,
    }),
    [theme],
  );

  const fcmRefreshed = useRef(false);
  useEffect(() => {
    // Only run once per session — user object reference changes on every profile
    // update, which would otherwise re-trigger the consent drawer each time.
    if (user && user.fcmTokens !== undefined && !fcmRefreshed.current) {
      fcmRefreshed.current = true;
      refreshFcmToken(setShowConsentDrawer, setAlert, user.fcmTokens);
    }
  }, [user]);

  const [openActivityDrawer, setOpenActivityDrawer] = useState(false);
  const [openNotificationDrawer, setOpenNotificationDrawer] = useState(false);

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

                {/* Floating viewport: fills whatever space remains below the
                    AppBar/Toolbar spacer (flex:1 + minHeight:0, rather than
                    a hardcoded calc(100vh - Npx), avoids depending on
                    Toolbar's height, which varies by breakpoint) and frames
                    every route the same way the chat page already did —
                    fixed height, margin for breathing room, content that
                    scrolls inside rather than the whole page. Transparent
                    background — individual routes/components (Paper, cards,
                    etc.) paint their own surfaces; a fill color here just
                    added an unwanted second layer. Route content that
                    manages its own internal pinned header/footer (TabsPanel,
                    DataList, Chat, the calendar) fills this via height:100%
                    and never triggers this box's own scroll; overflowY:auto
                    here is a safety net for anything else. */}
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    margin: "10px",
                    borderRadius: "12px",
                    backgroundColor: "transparent",
                    overflowY: "auto",
                    overflowX: "hidden",
                  }}
                >
                  <Routes location={location}>
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
            <Suspense fallback={null}>
              <ErrorBoundary fallback={null}>
                <ChatbotFab />
              </ErrorBoundary>
            </Suspense>

            <Suspense fallback={null}>
              <ErrorBoundary fallback={null}>
                <OnboardingModals />
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

export default memo(HomePage);
