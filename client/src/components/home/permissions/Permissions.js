import * as React from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Box from "@mui/material/Box";
import useTabs from "../../../hooks/useTabs";
import ErrorFallback from "../../customComponents/ErrorFallback";
import { ErrorBoundary } from "react-error-boundary";
import { ThemeContext } from "../../../contexts/ThemeContext";
import Teams from "./Teams";

const ManageRoles = React.lazy(() => import("./ManageRoles"));
const UserPermissions = React.lazy(() => import("./UserPermissions"));

function Permissions() {
  const { theme } = React.useContext(ThemeContext);
  const { a11yProps } = useTabs();
  const [value, setValue] = React.useState(
    () => Number(localStorage.getItem("permissions_tab_value")) || 0
  );

  const handleChange = (event, newValue) => {
    setValue(newValue);
    localStorage.setItem("permissions_tab_value", newValue);
  };

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
          {["Manage Roles", "User Permissions", "Teams"].map((label, index) => (
            <Tab key={index} label={label} {...a11yProps(index)} />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ p: 2 }}>
        {value === 0 && (
          <React.Suspense fallback={"Loading..."}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <ManageRoles />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 1 && (
          <React.Suspense fallback={"Loading..."}>
            <ErrorBoundary fallback={<ErrorFallback />}>
              <UserPermissions />
            </ErrorBoundary>
          </React.Suspense>
        )}

        {value === 2 && (
          <React.Suspense fallback={"Loading..."}>
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
