import * as React from "react";
import { Dropdown } from "primereact/dropdown";
import Box from "@mui/material/Box";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Paper from "@mui/material/Paper";
import CircularProgress from "@mui/material/CircularProgress";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import { AutoComplete } from "primereact/autocomplete";
import useUserList from "@web/shared/hooks/useUserList";
import useFetchData from "@web/shared/hooks/useFetchData";
import debounce from "lodash/debounce";
import { permissionStructure } from "@web/assets/data/permissionStructure";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import saveUserPermissions from "@web/shared/utils/permissions/saveUserPermissions";
import renderPermissionMatrix from "@web/shared/utils/permissions/renderPermissionMatrix";
import togglePermission from "@web/shared/utils/permissions/togglePermission";
import Button from "@web/shared/components/Button";
import { API_ENDPOINTS } from "@web/shared/constants";

function UserPermissions() {
  const { setAlert } = React.useContext(AlertContext);
  const [activeModule, setActiveModule] = React.useState("Attendance");
  const [permissions, setPermissions] = React.useState<any[]>([]);
  const [originalUserPermissions, setOriginalUserPermissions] = React.useState<
    any[]
  >([]);
  const [saving, setSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [selectedUser, setSelectedUser] = React.useState<any>(null);
  const [selectedRole, setSelectedRole] = React.useState<any>(null);
  const [isSuperUser, setIsSuperUser] = React.useState(false);
  const [typedUser, setTypedUser] = React.useState("");
  const [filteredUsers, setFilteredUsers] = React.useState<any[]>([]);

  // Get user list
  const userList = useUserList();

  // Fetch roles using custom hook
  const { data: rolesData, loading: loadingRoles } = useFetchData(
    "/get-role-and-permissions",
    "get",
    [],
    null,
    "Error loading roles",
  );

  // Fetch user permissions using custom hook
  const { data: userPermissionsData, loading: fetchingPermissions } =
    useFetchData(
      selectedUser ? `/get-user-permissions/${selectedUser}` : null,
      "get",
      [selectedUser],
      null,
      "Error loading user permissions",
    );

  // Fetch superuser status using custom hook
  const { data: superUserData } = useFetchData(
    selectedUser ? `/is-superuser/${selectedUser}` : null,
    "get",
    [selectedUser],
    null,
    null, // No error message needed for this check
  );

  // Extract roles from the fetched data
  const roles = React.useMemo(() => {
    return rolesData || [];
  }, [rolesData]);

  // Extract all modules from permissionStructure and sort alphabetically
  const modules = Object.keys(permissionStructure).sort((a, b) => {
    const aDisplay = a.replace(/([A-Z])/g, " $1").trim();
    const bDisplay = b.replace(/([A-Z])/g, " $1").trim();
    return aDisplay.localeCompare(bDisplay);
  });

  const handleSuperUserChange = async (event) => {
    const newSuperUserStatus = event.target.checked;

    try {
      const res = await apiClient.put(
        API_ENDPOINTS.UPDATE_SUPERUSER(selectedUser),
        {
          isSuperUser: newSuperUserStatus,
        },
      );

      setIsSuperUser(newSuperUserStatus);
      setHasChanges(true);

      // If making user a superuser, clear role selection
      if (newSuperUserStatus) {
        setSelectedRole(null);
      }

      setAlert({
        open: true,
        message: res.data.message,
        severity: "success",
      });
    } catch (error) {
      console.error("Error updating superuser status:", error);
      setAlert({
        open: true,
        message:
          error.response?.data?.message || "Error updating superuser status",
        severity: "error",
      });
    }
  };

  const handleSearch = React.useCallback(
    (query) => {
      // Add safety check for userList
      if (!userList || !Array.isArray(userList)) {
        setFilteredUsers([]);
        return;
      }

      const lowerQuery = query.toLowerCase();
      const results = userList.filter((user) =>
        user.toLowerCase().includes(lowerQuery),
      );
      setFilteredUsers(results);
    },
    [userList],
  );

  const debouncedSearchUser = React.useMemo(
    () => debounce(handleSearch, 300),
    [handleSearch],
  );

  React.useEffect(() => {
    return () => {
      debouncedSearchUser.cancel(); // cleanup
    };
  }, [debouncedSearchUser]);

  // Watch for permission changes and update hasChanges accordingly
  React.useEffect(() => {
    if (originalUserPermissions.length === 0 && permissions.length === 0) {
      // Both are empty, no changes
      setHasChanges(false);
      return;
    }

    // Compare current permissions with original permissions
    const hasActualChanges = !arraysEqual(
      [...permissions].sort(),
      [...originalUserPermissions].sort(),
    );

    setHasChanges(hasActualChanges);
  }, [permissions, originalUserPermissions]);

  // Update superuser status when data is fetched
  React.useEffect(() => {
    if (superUserData && superUserData.isSuperUser !== undefined) {
      setIsSuperUser(superUserData.isSuperUser);
    }
  }, [superUserData]);

  // Update permissions when user permissions data is fetched
  React.useEffect(() => {
    if (userPermissionsData && !fetchingPermissions) {
      const userPermissions = Array.isArray(userPermissionsData)
        ? userPermissionsData
        : [];

      setPermissions(userPermissions);
      setOriginalUserPermissions([...userPermissions]);

      // Reset the selected role when loading a new user
      setSelectedRole(null);

      // Reset hasChanges
      setHasChanges(false);
    } else if (!selectedUser) {
      // Reset permissions when no user is selected
      setPermissions([]);
      setOriginalUserPermissions([]);
      setIsSuperUser(false);
      setHasChanges(false);
    }
  }, [userPermissionsData, fetchingPermissions, selectedUser]);

  // Role change handler
  const handleRoleChangeWrapper = (e) => {
    const selectedRoleObj = e.value;

    setSelectedRole(selectedRoleObj);

    let newPermissions;

    if (selectedRoleObj && selectedRoleObj.permissions) {
      // Merge original user permissions with role permissions and remove duplicates
      const rolePermissions = selectedRoleObj.permissions;
      const mergedPermissions = [
        ...new Set([...originalUserPermissions, ...rolePermissions]),
      ];

      newPermissions = mergedPermissions;
      setPermissions(mergedPermissions);

      // Check if the merged permissions include super admin permissions
      setIsSuperUser(mergedPermissions.includes("*:*:*"));
    } else {
      // Role deselected - filter back to only original user permissions
      newPermissions = [...originalUserPermissions];
      setPermissions(newPermissions);

      // Check if original user permissions include super admin
      setIsSuperUser(originalUserPermissions.includes("*:*:*"));
    }
  };

  // Helper function to compare arrays
  const arraysEqual = (a, b) => {
    if (a.length !== b.length) return false;
    return a.every((val, index) => val === b[index]);
  };

  return (
    <Box>
      <div className="flex-div">
        <AutoComplete
          value={typedUser}
          suggestions={filteredUsers}
          completeMethod={(e) => {
            // Add safety check before calling debounced function
            if (debouncedSearchUser) {
              debouncedSearchUser(e.query);
            }
          }}
          onChange={(e) => {
            setTypedUser(e.value);
          }}
          onSelect={(e) => {
            setTypedUser(e.value);
            setSelectedUser(e.value);
          }}
          placeholder="Select User"
          className="login-input table-autocomplete"
          dropdown
        />

        <Dropdown
          value={selectedRole}
          onChange={handleRoleChangeWrapper}
          options={roles}
          optionLabel="name"
          placeholder="Select a Role"
          showClear
          style={{ marginLeft: "10px", maxWidth: "300px" }}
          disabled={fetchingPermissions || isSuperUser || loadingRoles}
        />
      </div>

      {selectedUser && (
        <Box sx={{ mt: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={isSuperUser}
                onChange={handleSuperUserChange}
                disabled={fetchingPermissions}
                sx={{
                  color: "#7C3BC2",
                  "&.Mui-checked": {
                    color: "#7C3BC2",
                  },
                }}
              />
            }
            label={
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                Is Superuser
              </Typography>
            }
          />
        </Box>
      )}

      {isSuperUser && (
        <div
          style={{
            backgroundColor: "#E5D8F2",
            margin: isSuperUser ? "10px 0 10px 0" : "10px 0 0 0",
            padding: "10px",
            color: "#7C3BC2",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          This user has Super Admin privileges and has access to all
          permissions. Individual permissions cannot be modified.
        </div>
      )}

      {!isSuperUser && <br />}
      {selectedUser && (
        <Paper
          sx={{
            width: "100%",
            overflow: "hidden",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.1)",
          }}
        >
          {fetchingPermissions ? (
            <Box
              sx={{
                p: 3,
                textAlign: "center",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "200px",
              }}
            >
              <CircularProgress size={30} sx={{ mr: 2 }} />
              <Typography>Loading user permissions...</Typography>
            </Box>
          ) : (
            <>
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
              {renderPermissionMatrix(
                activeModule,
                permissionStructure,
                isSuperUser,
                hasPermission,
                permissions,
                (module, action, scope) =>
                  togglePermission(
                    module,
                    action,
                    scope,
                    isSuperUser,
                    permissions,
                    setPermissions,
                    setHasChanges,
                    originalUserPermissions,
                  ),
                setPermissions,
                setHasChanges,
              )}
            </>
          )}
        </Paper>
      )}

      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
        {selectedUser && !saving && hasChanges && !isSuperUser && (
          <Button
            onClick={() =>
              saveUserPermissions(
                selectedUser,
                isSuperUser,
                setSaving,
                permissions,
                selectedRole,
                setHasChanges,
                setAlert,
                setPermissions,
                setOriginalUserPermissions,
              )
            }
            disabled={fetchingPermissions}
          >
            {saving ? "Saving..." : "Save Permissions"}
          </Button>
        )}
      </Box>
    </Box>
  );
}

export default React.memo(UserPermissions);
