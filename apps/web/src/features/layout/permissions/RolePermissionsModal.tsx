import { memo, useContext, useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "@web/shared/utils/modalStyle";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import { permissionStructure } from "@web/assets/data/permissionStructure";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import Button from "@web/shared/components/Button";
import useFetchData from "@web/shared/hooks/useFetchData";
import { API_ENDPOINTS } from "@web/shared/constants";

function RolePermissionsModal(props) {
  const { setAlert } = useContext(AlertContext);
  const [activeModule, setActiveModule] = useState("");
  const [rolePermissions, setRolePermissions] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const { theme } = useContext(ThemeContext);

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

  // Render permission matrix based on active module
  const renderPermissionMatrix = () => {
    const module = activeModule;
    const moduleStructure = permissionStructure[module];

    if (!moduleStructure)
      return <Typography>Module structure not found</Typography>;

    const actions = Object.keys(moduleStructure.actions);

    const availableScopes = ["self", "team", "all", "-"].filter((scope) =>
      actions.some((action) => moduleStructure.actions[action].includes(scope)),
    );

    if (loading) {
      return (
        <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
          <CircularProgress size={24} />
        </Box>
      );
    }

    return (
      <Box
        sx={{
          maxHeight: 450,
          overflow: "auto",
        }}
      >
        <TableContainer
          component={Paper}
          sx={{
            overflow: "auto",
          }}
        >
          <Table
            aria-label="permission matrix"
            size="small"
            padding="none"
            sx={{ backgroundColor: theme === "light" ? "#fff" : "#1C262A" }}
          >
            <TableHead>
              <TableRow>
                <TableCell sx={{ py: 1, px: 1, fontWeight: "bold" }}>
                  Action
                </TableCell>
                {/* Only show scope columns that are relevant to this module */}
                {availableScopes.map((scope) => (
                  <TableCell
                    key={scope}
                    align="center"
                    sx={{ py: 1, px: 1, fontWeight: "bold" }}
                  >
                    {scope === "-"
                      ? "Global"
                      : scope.charAt(0).toUpperCase() + scope.slice(1)}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {actions.map((action) => (
                <TableRow key={action} hover>
                  <TableCell component="th" scope="row" sx={{ py: 0.5, px: 1 }}>
                    {action
                      .split("_")
                      .map(
                        (word) => word.charAt(0).toUpperCase() + word.slice(1),
                      )
                      .join(" ")}
                  </TableCell>
                  {availableScopes.map((scope) => {
                    // Only show checkboxes for scopes that are valid for this action
                    const isValidScope =
                      moduleStructure.actions[action].includes(scope);

                    return isValidScope ? (
                      <TableCell
                        key={scope}
                        align="center"
                        sx={{ py: 0, px: 1 }}
                      >
                        <Checkbox
                          checked={hasPermission(module, action, scope)}
                          onChange={() =>
                            togglePermission(module, action, scope)
                          }
                          size="small"
                        />
                      </TableCell>
                    ) : scope === "-" &&
                      moduleStructure.actions[action].includes("-") ? (
                      <TableCell
                        key={scope}
                        colSpan={4}
                        align="center"
                        sx={{ py: 0, px: 1 }}
                      >
                        <Checkbox
                          checked={hasPermission(module, action, scope)}
                          onChange={() =>
                            togglePermission(module, action, scope)
                          }
                          size="small"
                        />
                      </TableCell>
                    ) : (
                      <TableCell
                        key={scope}
                        align="center"
                        sx={{ py: 0, px: 1 }}
                      >
                        {/* Empty disabled cell for invalid combinations */}—
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
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
    <div>
      <Modal
        open={props.open}
        onClose={props.handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        disableEscapeKeyDown
        disablePortal
        BackdropProps={{
          timeout: 200,
          sx: {
            backgroundColor: "rgba(0, 0, 0, 0.4)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
          },
        }}
      >
        <Box
          sx={{
            ...style,
            width: "90%",
            maxWidth: "1400px",
          }}
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

            {renderPermissionMatrix()}
          </Paper>

          <Box sx={{ mt: 2, display: "flex", justifyContent: "space-between" }}>
            <Button onClick={props.handleClose}>Cancel</Button>

            {!saving && hasChanges && !loading && (
              <Button onClick={saveRolePermissions}>Save Permissions</Button>
            )}
          </Box>
        </Box>
      </Modal>
    </div>
  );
}

export default memo(RolePermissionsModal);
