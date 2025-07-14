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
import { TabValueContext } from "../contexts/TabValueContext.js";
import AppbarComponent from "../components/home/AppbarComponent.js";
import DrawerComponent from "../components/home/DrawerComponent.js";
import routesConfig from "../routes/routesConfig.js";
import { UserContext } from "../contexts/UserContext";
import { NotificationContext } from "../contexts/NotificationContext";
import useNotifications from "../hooks/useNotifications.js";
import { ThemeContext } from "../contexts/ThemeContext.js";
import { AlertContext } from "../contexts/AlertContext.js";
import { refreshFcmToken } from "../utils/pushNotifications/refreshFcmToken.js";
import { ErrorBoundary } from "react-error-boundary";
import ErrorFallback from "../components/customComponents/ErrorFallback.js";
import { ChatBotWidget } from "chatbot-widget-ui";
import apiClient from "../config/axiosConfig.js";
import ChatIcon from "@mui/icons-material/Chat";
const UnAuthorisedRoute = React.lazy(() =>
  import("../routes/UnAuthorisedRoute.js")
);
const Tour = React.lazy(() => import("../components/home/Tour.js"));
const ActivityDrawer = React.lazy(() =>
  import("../components/home/ActivityDrawer.js")
);
const NotificationDrawer = React.lazy(() =>
  import("../components/home/NotificationDrawer.js")
);
const NotificationConsentDrawer = React.lazy(() =>
  import("../components/customComponents/NotificationConsentDrawer.js")
);

const drawerWidth = 60;

function HomePage(props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [messages, setMessages] = useState([
    { type: "bot", text: "Hello, how can I assist you today!" },
  ]);
  const [tabValue, setTabValue] = useState(0);
  const [run, setRun] = useState(false);
  const [showConsentDrawer, setShowConsentDrawer] = useState(false);
  const { user } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);
  const { setAlert } = useContext(AlertContext);
  const { notifications, setNotifications, loading, setLoading } =
    useNotifications(user);

  // Memoized values to prevent unnecessary re-renders
  const filteredRoutes = useMemo(() => routesConfig(user), [user]);

  const notificationContextValue = useMemo(
    () => ({
      notifications,
      setNotifications,
      loading,
      setLoading,
    }),
    [notifications, setNotifications, loading, setLoading]
  );

  const tabValueContextValue = useMemo(
    () => ({ tabValue, setTabValue }),
    [tabValue]
  );

  const mainBoxStyles = useMemo(
    () => ({
      flexGrow: 1,
      width: { lg: `calc(100% - ${drawerWidth}px)` },
      backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
      height: "100vh",
      overflow: "scroll",
      padding: "20px",
      paddingTop: "10px",
    }),
    [theme]
  );

  useEffect(() => {
    // Only call refreshFcmToken when user data is fully loaded
    if (user && user.fcmTokens !== undefined) {
      refreshFcmToken(setShowConsentDrawer, setAlert, user.fcmTokens);
    }
    // eslint-disable-next-line
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

  const handleChatbot = async (message) => {
    try {
      const response = await apiClient.post(`/chatbot`, {
        message,
      });

      // Assuming API returns { content: "response text" }
      return (
        response.data.response ||
        "Sorry, I didn't understand that. Can you please rephrase?"
      );
    } catch (error) {
      console.error("Error in API call:", error);
      return "Oops! Something went wrong. Try again."; // Fallback error message
    }
  };

  return (
    <NotificationContext.Provider value={notificationContextValue}>
      <TabValueContext.Provider value={tabValueContextValue}>
        <Tour run={run} setRun={setRun} />
        <Box sx={{ display: "flex" }}>
          <CssBaseline />
          <ErrorBoundary fallback={<ErrorFallback />}>
            <AppbarComponent
              mobileOpen={mobileOpen}
              setMobileOpen={setMobileOpen}
              showSidebar={props.showSidebar}
              setShowSidebar={props.setShowSidebar}
              setRun={setRun}
              setOpenNotificationDrawer={setOpenNotificationDrawer}
              setOpenActivityDrawer={setOpenActivityDrawer}
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

            <Routes>
              {filteredRoutes.map(
                ({ path, element, allowedModules }, index) => (
                  <Route
                    key={index}
                    path={path}
                    element={
                      allowedModules.length === 0 ? (
                        element
                      ) : (
                        <Suspense fallback={<div>Loading...</div>}>
                          <ErrorBoundary fallback={<ErrorFallback />}>
                            {element}
                          </ErrorBoundary>
                        </Suspense>
                      )
                    }
                  />
                )
              )}
              <Route
                path="*"
                element={
                  <Suspense fallback={<div>Loading...</div>}>
                    <ErrorBoundary fallback={<ErrorFallback />}>
                      <UnAuthorisedRoute />
                    </ErrorBoundary>
                  </Suspense>
                }
              />
            </Routes>

            <ActivityDrawer
              open={openActivityDrawer}
              setOpen={setOpenActivityDrawer}
              toggleDrawer={toggleActivityDrawer}
            />

            <NotificationDrawer
              open={openNotificationDrawer}
              setOpen={setOpenNotificationDrawer}
              toggleDrawer={toggleNotificationDrawer}
            />
          </Box>
        </Box>

        <NotificationConsentDrawer
          showConsentDrawer={showConsentDrawer}
          setShowConsentDrawer={setShowConsentDrawer}
          setAlert={setAlert}
        />
      </TabValueContext.Provider>

      <ChatBotWidget
        callApi={handleChatbot}
        primaryColor="#0B61AE"
        inputMsgPlaceholder="Type your message..."
        chatbotName="Chatbot"
        isTypingMessage="Typing..."
        IncommingErrMsg="Oops! Something went wrong. Try again."
        handleNewMessage={setMessages}
        chatIcon={<ChatIcon />}
        messages={messages}
      />
      <button className="chatbot-toggler" style={{ display: "none" }}>
        Toggle Chatbot
      </button>
    </NotificationContext.Provider>
  );
}

export default React.memo(HomePage);
