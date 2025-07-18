import * as React from "react";
import { Dropdown } from "primereact/dropdown";
import Box from "@mui/material/Box";
import apiClient from "../../../config/axiosConfig";
import { AlertContext } from "../../../contexts/AlertContext";
import {
  Typography,
  Tabs,
  Tab,
  Paper,
  CircularProgress,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { AutoComplete } from "primereact/autocomplete";
import useUserAutoComplete from "../../../hooks/useUserAutocomplete";
import useUserList from "../../../hooks/useUserList";
import debounce from "lodash/debounce";
import { permissionStructure } from "../../../assets/data/permissionStructure";
import hasPermission from "../../../utils/permissions/hasPermission";
import saveUserPermissions from "../../../utils/permissions/saveUserPermissions";
import handleRoleChange from "../../../utils/permissions/handleRoleChange";
import renderPermissionMatrix from "../../../utils/permissions/renderPermissionMatrix";
import togglePermission from "../../../utils/permissions/togglePermission";

function UserPermissions() {
  const { setAlert } = React.useContext(AlertContext);
  const [activeModule, setActiveModule] = React.useState("Attendance");
  const [permissions, setPermissions] = React.useState([]);
  const [originalUserPermissions, setOriginalUserPermissions] = React.useState(
    []
  );
  const [saving, setSaving] = React.useState(false);
  const [hasChanges, setHasChanges] = React.useState(false);
  const [roles, setRoles] = React.useState([]);
  const [selectedRole, setSelectedRole] = React.useState(null);
  const [isSuperUser, setIsSuperUser] = React.useState(false);
  const [fetchingPermissions, setFetchingPermissions] = React.useState(false);

  // Extract all modules for navigation and sort them alphabetically by their display name
  const modules = Object.keys(permissionStructure).sort((a, b) => {
    const aDisplay = a.replace(/([A-Z])/g, " $1").trim();
    const bDisplay = b.replace(/([A-Z])/g, " $1").trim();
    return aDisplay.localeCompare(bDisplay);
  });

  // Set initial active module on first render
  React.useEffect(() => {
    // Set first module in alphabetical order as active if exists
    if (modules.length > 0) {
      setActiveModule(modules[0]);
    }
    // eslint-disable-next-line
  }, []);

  const userList = useUserList();

  const {
    selectedUser,
    setSelectedUser,
    typedUser,
    setTypedUser,
    filteredUsers,
    setFilteredUsers,
  } = useUserAutoComplete(userList);

  React.useEffect(() => {
    let isMounted = true;

    async function checkSuperUser() {
      if (selectedUser) {
        try {
          const res = await apiClient.get(`/is-superuser/${selectedUser}`);
          // Only update state if component is still mounted
          if (isMounted) {
            setIsSuperUser(res.data.isSuperUser);
          }
        } catch (error) {
          console.error("Error checking superuser status:", error);
          // Optionally handle error state if component is still mounted
          if (isMounted) {
            setIsSuperUser(false); // Default to false on error
          }
        }
      }
    }

    checkSuperUser();

    return () => {
      isMounted = false;
    };
  }, [selectedUser]);

  const handleSuperUserChange = async (event) => {
    const newSuperUserStatus = event.target.checked;

    try {
      const res = await apiClient.put(`/update-superuser/${selectedUser}`, {
        isSuperUser: newSuperUserStatus,
      });

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
        message: error.response.data.message,
        severity: "error",
      });
    }
  };

  const handleSearch = React.useCallback(
    (query) => {
      const lowerQuery = query.toLowerCase();
      const results = userList.filter((user) =>
        user.toLowerCase().includes(lowerQuery)
      );
      setFilteredUsers(results);
    },
    // eslint-disable-next-line
    [userList]
  );

  const debouncedSearchUser = React.useMemo(
    () => debounce(handleSearch, 300),
    [handleSearch]
  );

  React.useEffect(() => {
    return () => {
      debouncedSearchUser.cancel(); // cleanup
    };
  }, [debouncedSearchUser]);

  React.useEffect(() => {
    let isMounted = true;

    async function checkSuperUser() {
      if (selectedUser) {
        try {
          const res = await apiClient.get(`/is-superuser/${selectedUser}`);
          // Only update state if component is still mounted
          if (isMounted) {
            setIsSuperUser(res.data.isSuperUser);
          }
        } catch (error) {
          console.error("Error checking superuser status:", error);
          // Optionally handle error state if component is still mounted
          if (isMounted) {
            setIsSuperUser(false); // Default to false on error
          }
        }
      }
    }

    checkSuperUser();

    return () => {
      isMounted = false;
    };
  }, [selectedUser]);

  // Get role and permissions useEffect
  React.useEffect(() => {
    let isMounted = true;

    async function getRolePermissions() {
      try {
        const response = await apiClient.get(`/get-role-and-permissions`);
        // Only update state if component is still mounted
        if (isMounted) {
          setRoles(response.data);
        }
      } catch (error) {
        console.error("Error fetching role permissions:", error);
        if (isMounted) {
          setAlert({
            open: true,
            message: "Error loading roles",
            severity: "error",
          });
        }
      }
    }

    getRolePermissions();

    return () => {
      isMounted = false;
    };
  }, [setAlert]);

  // Fetch user permissions when a user is selected
  React.useEffect(() => {
    let isMounted = true;

    async function getUserPermissions() {
      if (!selectedUser) return;

      if (isMounted) {
        setFetchingPermissions(true);
      }

      try {
        const res = await apiClient.get(
          `/get-user-permissions/${selectedUser}`
        );

        // Only update state if component is still mounted
        if (isMounted) {
          const userPermissions = Array.isArray(res.data) ? res.data : [];

          setPermissions(userPermissions);
          setOriginalUserPermissions([...userPermissions]); // Store original user permissions

          // Reset the selected role when loading a new user
          setSelectedRole(null);

          // Reset hasChanges
          setHasChanges(false);
        }
      } catch (error) {
        console.error("Error fetching user permissions:", error);

        if (isMounted) {
          setAlert({
            open: true,
            message: "Error loading user permissions",
            severity: "error",
          });

          // Reset permissions on error
          setPermissions([]);
          setOriginalUserPermissions([]);
          setIsSuperUser(false);
        }
      } finally {
        if (isMounted) {
          setFetchingPermissions(false);
        }
      }
    }

    getUserPermissions();

    return () => {
      isMounted = false;
    };
  }, [selectedUser, setAlert]);

  return (
    <Box>
      <div className="flex-div">
        <AutoComplete
          value={typedUser}
          suggestions={filteredUsers}
          completeMethod={(e) => debouncedSearchUser(e.query)}
          onChange={(e) => {
            setTypedUser(e.value);
          }}
          onSelect={(e) => {
            setTypedUser(e.value);
            setSelectedUser(e.value); // This triggers the API call
          }}
          placeholder="Select User"
          className="login-input table-autocomplete"
          dropdown
        />

        <Dropdown
          value={selectedRole}
          onChange={(e) =>
            handleRoleChange(
              e,
              setSelectedRole,
              setPermissions,
              setIsSuperUser,
              setHasChanges,
              originalUserPermissions,
              selectedRole
            )
          }
          options={roles}
          optionLabel="name"
          placeholder="Select a Role"
          showClear
          style={{ marginLeft: "10px", maxWidth: "300px" }}
          disabled={fetchingPermissions || isSuperUser}
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
                    originalUserPermissions // Pass originalUserPermissions here
                  ),
                setPermissions,
                setHasChanges
              )}
            </>
          )}
        </Paper>
      )}
      <Box sx={{ mt: 2, display: "flex", justifyContent: "flex-end" }}>
        {selectedUser && !saving && hasChanges && (
          <button
            className="btn"
            onClick={() =>
              saveUserPermissions(
                selectedUser,
                isSuperUser,
                setSaving,
                permissions,
                selectedRole,
                setHasChanges,
                setAlert
              )
            }
            disabled={isSuperUser || fetchingPermissions}
          >
            {saving ? "Saving..." : "Save Permissions"}
          </button>
        )}
      </Box>
    </Box>
  );
}

export default React.memo(UserPermissions);
