import { memo, useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import CustomModal from "@web/shared/components/Modal";
import { style } from "@web/shared/utils/modalStyle";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import { permissionStructure } from "@web/assets/data/permissionStructure";
import Button from "@web/shared/components/Button";
import PermissionMatrix from "@web/shared/components/PermissionMatrix";
import useFetchData from "@web/shared/hooks/useFetchData";
import { API_ENDPOINTS } from "@web/shared/constants";

function RolePermissionsModal(props) {
  const { setAlert } = useContext(AlertContext);
  const [activeModule, setActiveModule] = useState("");
  const [rolePermissions, setRolePermissions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: fetchedPermissions, loading } = useFetchData(
    `/get-role-permissions/${props.roleId}`,
    "get",
    [props.roleId],
    null,
    "Error fetching role permissions",
  );

  // Extract all modules for navigation and sort them alphabetically by their display name
  const modules = Object.keys(permissionStructure).sort((a, b) => {
    const aDisplay = a.replace(/([A-Z])/g, " $1").trim();
    const bDisplay = b.replace(/([A-Z])/g, " $1").trim();
    return aDisplay.localeCompare(bDisplay);
  });

  const hasPermission = (module, action, scope) => {
    // Check for super admin wildcard permission
    if (rolePermissions.includes("*:*:*")) {
      return true;
    }

    // Check for exact permission
    let permissionString;

    // Special handling for JobOpenings and similar modules that use a different format
    if (scope === "-") {
      permissionString = `${module}:${action}`;
    } else {
      permissionString = `${module}:${action}:${scope}`;
    }

    return rolePermissions.includes(permissionString);
  };

  // Toggle a specific permission
  const togglePermission = (module, action, scope) => {
    let permissionString;

    // Special handling for JobOpenings and similar modules that use a different format
    if (scope === "-") {
      permissionString = `${module}:${action}`;
    } else {
      permissionString = `${module}:${action}:${scope}`;
    }

    let updatedPermissions = [...rolePermissions];

    if (hasPermission(module, action, scope)) {
      // Remove permission if it exists
      updatedPermissions = updatedPermissions.filter(
        (p) => p !== permissionString,
      );
    } else {
      // Add permission if it doesn't exist
      updatedPermissions.push(permissionString);
    }

    setRolePermissions(updatedPermissions);
    setHasChanges(true);
  };

  // Save role permissions
  const saveRolePermissions = async () => {
    setSaving(true);

    try {
      await apiClient.put(API_ENDPOINTS.UPDATE_ROLE_PERMISSIONS(props.roleId), {
        permissions: rolePermissions,
      });

      // Set local success state
      setHasChanges(false);

      // Delay the global alert to avoid re-render issues
      setTimeout(() => {
        setAlert({
          open: true,
          message: "Permissions updated successfully",
          severity: "success",
        });
      }, 100);
    } catch (error) {
      setTimeout(() => {
        setAlert({
          open: true,
          message:
            error.message === "Network Error"
              ? "Network Error, your details will be submitted when you are back online"
              : error.response?.data?.message || "Error updating permissions",
          severity: "error",
        });
      }, 100);
    } finally {
      setSaving(false);
    }
  };

  // Set initial active module on first render
  useEffect(() => {
    // Set first module in alphabetical order as active if exists
    if (modules.length > 0) {
      setActiveModule(modules[0]);
    }
  }, []);

  // Update rolePermissions state when data is fetched
  useEffect(() => {
    if (fetchedPermissions && !loading) {
      let permissions: any[] = [];

      if (Array.isArray(fetchedPermissions.permissions)) {
        permissions = fetchedPermissions.permissions;
      } else if (Array.isArray(fetchedPermissions)) {
        permissions = fetchedPermissions;
      } else if (
        fetchedPermissions &&
        typeof fetchedPermissions === "object" &&
        fetchedPermissions.permissions
      ) {
        permissions = fetchedPermissions.permissions;
      }

      setRolePermissions(permissions);
      setHasChanges(false);
    }
  }, [fetchedPermissions, loading]);

  return (
    <CustomModal
      open={props.open}
      handleClose={props.handleClose}
      modalStyle={{
        ...style,
        width: { xs: "95%", sm: 750, md: 950 },
      }}
      disableEscapeKeyDown
    >
      <Typography variant="h6" sx={{ mb: 1 }}>
        Manage Permissions for: {props.roleName}
      </Typography>

      <Paper
        sx={{
          width: "100%",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Tabs
          value={activeModule}
          onChange={(e, newValue) => setActiveModule(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            borderColor: "divider",
            "& .MuiTabs-flexContainer": {
              height: "auto",
            },
            "& .MuiTab-root": {
              px: 1.5,
              fontSize: "0.875rem",
            },
          }}
        >
          {modules.map((module) => (
            <Tab
              key={module}
              value={module}
              label={module.replace(/([A-Z])/g, " $1").trim()}
            />
          ))}
        </Tabs>

        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <PermissionMatrix
            activeModule={activeModule}
            permissionStructure={permissionStructure}
            isChecked={hasPermission}
            onToggle={togglePermission}
          />
        )}
      </Paper>

      <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between" }}>
        <Button onClick={props.handleClose}>Cancel</Button>

        {!saving && hasChanges && !loading && (
          <Button onClick={saveRolePermissions}>Save Permissions</Button>
        )}
      </Box>
    </CustomModal>
  );
}

export default memo(RolePermissionsModal);
