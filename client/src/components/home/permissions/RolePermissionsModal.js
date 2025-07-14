import * as React from "react";
import Box from "@mui/material/Box";
import Modal from "@mui/material/Modal";
import { style } from "../../../utils/modalStyle";
import apiClient from "../../../config/axiosConfig";
import { AlertContext } from "../../../contexts/AlertContext";
import {
  Typography,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  CircularProgress,
} from "@mui/material";
import { permissionStructure } from "../../../assets/data/permissionStructure";

function RolePermissionsModal(props) {
  const { setAlert } = React.useContext(AlertContext);
  const [activeModule, setActiveModule] = React.useState("");
  const [rolePermissions, setRolePermissions] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [loading, setLoading] = React.useState(true); // Loading state for permissions fetch

  // Extract all modules for navigation and sort them alphabetically by their display name
  const modules = Object.keys(permissionStructure).sort((a, b) => {
    const aDisplay = a.replace(/([A-Z])/g, " $1").trim();
    const bDisplay = b.replace(/([A-Z])/g, " $1").trim();
    return aDisplay.localeCompare(bDisplay);
  });

  // Check if a specific permission exists
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
        (p) => p !== permissionString
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
      await apiClient.put(`/update-role-permissions/${props.roleId}`, {
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
      // Similar approach for errors
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

    // Get all unique scopes used in this module
    const availableScopes = ["self", "team", "all", "-"].filter((scope) =>
      actions.some((action) => moduleStructure.actions[action].includes(scope))
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
          mt: 2,
        }}
      >
        <TableContainer
          component={Paper}
          sx={{
            overflow: "auto",
          }}
        >
          <Table aria-label="permission matrix" size="small" padding="none">
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
                        (word) => word.charAt(0).toUpperCase() + word.slice(1)
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
  React.useEffect(() => {
    // Set first module in alphabetical order as active if exists
    if (modules.length > 0) {
      setActiveModule(modules[0]);
    }
    // eslint-disable-next-line
  }, []);

  // Fetch role permissions from the database when the modal opens
  React.useEffect(() => {
    async function getRolePermissions() {
      if (!props.roleId) return;

      setLoading(true);
      try {
        const res = await apiClient.get(
          `/get-role-permissions/${props.roleId}`
        );

        // Set the fetched permissions to state
        if (res.data && Array.isArray(res.data.permissions)) {
          setRolePermissions(res.data.permissions);
        } else if (
          res.data &&
          typeof res.data === "object" &&
          res.data.permissions
        ) {
          setRolePermissions(res.data.permissions);
        } else {
          // If the response format is different, try to handle it
          const permissions = Array.isArray(res.data) ? res.data : [];
          setRolePermissions(permissions);
        }

        // Reset changes flag since we're just loading initial data
        setHasChanges(false);
      } catch (error) {
        console.error("Error fetching role permissions:", error);
        setAlert({
          open: true,
          message: "Error fetching role permissions. Please try again.",
          severity: "error",
        });
        setRolePermissions([]);
      } finally {
        setLoading(false);
      }
    }

    getRolePermissions();
    // eslint-disable-next-line
  }, [props.roleId]);

  return (
    <div>
      <Modal
        open={props.open}
        onClose={props.handleClose}
        aria-labelledby="modal-modal-title"
        aria-describedby="modal-modal-description"
        disableEscapeKeyDown
        disablePortal
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
            <button className="btn btn-secondary" onClick={props.handleClose}>
              Cancel
            </button>

            {!saving && hasChanges && !loading && (
              <button className="btn" onClick={saveRolePermissions}>
                Save Permissions
              </button>
            )}
          </Box>
        </Box>
      </Modal>
    </div>
  );
}

export default React.memo(RolePermissionsModal);
