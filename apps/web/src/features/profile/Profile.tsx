import * as React from "react";
import "../../styles/profile.scss";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import useTabs from "@web/shared/hooks/useTabs";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";
import { useNavigate, useLocation } from "react-router-dom";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { ThemeContext } from "@web/app/providers/ThemeContext";
const BasicInfo = React.lazy(() => import("./BasicInfo"));
const PushNotifications = React.lazy(() => import("./PushNotifications"));
const WebAuthnDevices = React.lazy(() => import("./WebAuthnDevices"));
const SalarySlip = React.lazy(() => import("./SalarySlip"));

const tabLabels = [
  "Basic Info",
  "Push Notifications",
  "Security Keys",
  "Salary Slip",
];

const tabSlugs = [
  "basic-info",
  "push-notifications",
  "security-keys",
  "salary-slip",
];

function Profile() {
  const { setUser, user } = React.useContext(UserContext);
  const navigate = useNavigate();
  const location = useLocation();
  const { a11yProps } = useTabs();
  const { theme } = React.useContext(ThemeContext);

  const value = React.useMemo(() => {
    const slug = location.pathname.split("/").pop();
    const index = tabSlugs.indexOf(slug || "");
    return index >= 0 ? index : 0;
  }, [location.pathname]);

  // Redirect /profile or unknown sub-paths to last visited tab (or default)
  React.useEffect(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || !tabSlugs.includes(parts[1])) {
      const savedSlug = localStorage.getItem("profile_tab_value");
      const targetSlug =
        savedSlug && tabSlugs.includes(savedSlug) ? savedSlug : tabSlugs[0];
      navigate(`/profile/${targetSlug}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleChange = (event, newValue) => {
    const slug = tabSlugs[newValue];
    localStorage.setItem("profile_tab_value", slug);
    navigate(`/profile/${slug}`);
  };

  // Fetch full profile data on mount and merge into user context (in-memory only)
  React.useEffect(() => {
    apiClient(API_ENDPOINTS.GET_PROFILE)
      .then((res) => {
        if (res.data.success) {
          setUser((prev) => ({ ...prev, ...res.data.data.user }));
        }
      })
      .catch((err) => console.error("Error fetching profile:", err));
  }, [setUser]);

  return (
    <Box
      sx={{
        width: "100%",
        position: "relative",
        backgroundColor: "transparent !important",
      }}
    >
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
        <Tabs
          value={value}
          onChange={handleChange}
          aria-label="profile tabs"
          variant="scrollable"
        >
          {tabLabels.map((label, index) => (
            <Tab key={index} label={label} {...a11yProps(index)} />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ p: 1 }}>
        {value === 0 && (
          <React.Suspense
            fallback={
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  p: 4,
                }}
              >
                <CircularProgress size={24} />
              </Box>
            }
          >
            <ErrorBoundary fallback={<ErrorFallback />}>
              <BasicInfo user={user} />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 1 && (
          <div className="profile-container">
            <React.Suspense
              fallback={
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    p: 4,
                  }}
                >
                  <CircularProgress size={24} />
                </Box>
              }
            >
              <ErrorBoundary fallback={<ErrorFallback />}>
                <PushNotifications />
              </ErrorBoundary>
            </React.Suspense>
          </div>
        )}

        {value === 2 && (
          <React.Suspense
            fallback={
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  p: 4,
                }}
              >
                <CircularProgress size={24} />
              </Box>
            }
          >
            <ErrorBoundary fallback={<ErrorFallback />}>
              <WebAuthnDevices />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 3 && (
          <React.Suspense
            fallback={
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  p: 4,
                }}
              >
                <CircularProgress size={24} />
              </Box>
            }
          >
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
