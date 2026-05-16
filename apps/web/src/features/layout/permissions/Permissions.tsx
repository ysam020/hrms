import * as React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import useTabs from "@web/shared/hooks/useTabs";
import ErrorFallback from "@web/shared/components/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Teams from "./Teams";
import { useNavigate, useLocation } from "react-router-dom";
import CircularProgress from "@mui/material/CircularProgress";

const ManageRoles = React.lazy(() => import("./ManageRoles"));
const UserPermissions = React.lazy(() => import("./UserPermissions"));

const tabSlugs = ["manage-roles", "user-permissions", "teams"];

function Permissions() {
  const { theme } = React.useContext(ThemeContext);
  const { a11yProps } = useTabs();
  const navigate = useNavigate();
  const location = useLocation();

  const value = React.useMemo(() => {
    const slug = location.pathname.split("/").pop();
    const index = tabSlugs.indexOf(slug || "");
    return index >= 0 ? index : 0;
  }, [location.pathname]);

  React.useEffect(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length < 2 || !tabSlugs.includes(parts[1])) {
      const savedSlug = localStorage.getItem("permissions_tab_value");
      const targetSlug =
        savedSlug && tabSlugs.includes(savedSlug) ? savedSlug : tabSlugs[0];
      navigate(`/permissions/${targetSlug}`, { replace: true });
    }
  }, [location.pathname, navigate]);

  const handleChange = (event, newValue) => {
    const slug = tabSlugs[newValue];
    localStorage.setItem("permissions_tab_value", slug);
    navigate(`/permissions/${slug}`);
  };

  return (
    <Box sx={{ width: "100%", position: "relative" }}>
      <Box
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          position: "sticky",
          top: 0,
          zIndex: 3,
          backgroundColor: theme === "light" ? "#F9FAFB" : "#111B21",
          elevation: 3,
        }}
      >
        <Tabs value={value} onChange={handleChange} aria-label="profile tabs">
          {["Manage Roles", "User Permissions", "Teams"].map((label, index) => (
            <Tab key={index} label={label} {...a11yProps(index)} />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ p: 2 }}>
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
              <ManageRoles />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 1 && (
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
              <UserPermissions />
            </ErrorBoundary>
          </React.Suspense>
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
              <Teams />
            </ErrorBoundary>
          </React.Suspense>
        )}
      </Box>
    </Box>
  );
}

export default React.memo(Permissions);
