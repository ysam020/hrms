import * as React from "react";
import "../../styles/profile.scss";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import useTabs from "../../hooks/useTabs";
import { getSessionData } from "@hrms/auth";
import { UserContext } from "../../contexts/UserContext";
import { useNavigate } from "react-router-dom";
import { AlertContext } from "../../contexts/AlertContext";
import ErrorFallback from "../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { ThemeContext } from "../../contexts/ThemeContext";

const BasicInfo = React.lazy(() => import("./BasicInfo"));
const LoggedInDevices = React.lazy(() => import("./LoggedInDevices"));
const ResetPassword = React.lazy(() => import("./ResetPassword"));
const BackupCodes = React.lazy(() => import("./BackupCodes"));
const TwoFactorAuthentication = React.lazy(() =>
  import("./TwoFactorAuthentication")
);
const PushNotifications = React.lazy(() => import("./PushNotifications"));
const SalarySlip = React.lazy(() => import("./SalarySlip"));

const tabLabels = [
  "Basic Info",
  "Logged in Devices",
  "2FA and Notifications",
  "Reset Password",
  "Backup Codes",
  "Salary Slip",
];

function Profile() {
  const [value, setValue] = React.useState(
    () => Number(localStorage.getItem("profile_tab_value")) || 0
  );
  const [geolocation, setGeolocation] = React.useState([]);
  const { setUser, user } = React.useContext(UserContext);
  const [loading, setLoading] = React.useState(false);
  const { setAlert } = React.useContext(AlertContext);
  const navigate = useNavigate();
  const { a11yProps } = useTabs();
  const { theme } = React.useContext(ThemeContext);

  const handleChange = (event, newValue) => {
    setValue(newValue);
    localStorage.setItem("profile_tab_value", newValue);
  };

  React.useEffect(() => {
    getSessionData(setGeolocation, setLoading);
  }, []);

  const logOutAllDevices = React.useCallback(async () => {
    const { logOutFromAllSessions } = await import("@hrms/auth");
    logOutFromAllSessions(setUser, navigate, setAlert);
  }, [setUser, navigate, setAlert]);

  return (
    <Box sx={{ width: "100%", position: "relative" }}>
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          position: "sticky",
          top: 50,
          zIndex: 1,
          backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
          elevation: 3,
        }}
      >
        <Tabs value={value} onChange={handleChange} aria-label="profile tabs">
          {tabLabels.map((label, index) => (
            <Tab key={index} label={label} {...a11yProps(index)} />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ p: 2 }}>
        {value === 0 && (
          <React.Suspense fallback={"Loading..."}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <BasicInfo user={user} />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 1 && (
          <React.Suspense fallback={"Loading..."}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <>
                <LoggedInDevices
                  geolocation={geolocation}
                  setGeolocation={setGeolocation}
                  loading={loading}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "20px",
                  }}
                >
                  <button className="btn" onClick={logOutAllDevices}>
                    Log out from all devices
                  </button>
                </div>
              </>
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 2 && (
          <div className="profile-container">
            <React.Suspense fallback={"Loading..."}>
              <ErrorBoundary fallback={<ErrorFallback />}>
                <TwoFactorAuthentication />
              </ErrorBoundary>
              <ErrorBoundary fallback={<ErrorFallback />}>
                <PushNotifications />
              </ErrorBoundary>
            </React.Suspense>
          </div>
        )}

        {value === 3 && (
          <React.Suspense fallback={"Loading..."}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <ResetPassword />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 4 && (
          <React.Suspense fallback={"Loading..."}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <BackupCodes />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 5 && (
          <React.Suspense fallback={"Loading..."}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <SalarySlip />
            </ErrorBoundary>
          </React.Suspense>
        )}
      </Box>
    </Box>
  );
}

export default React.memo(Profile);
