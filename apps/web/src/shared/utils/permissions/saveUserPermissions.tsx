import apiClient from "@web/core/http/axiosConfig";
import { API_ENDPOINTS } from "@web/shared/constants";

const saveUserPermissions = async (
  selectedUser,
  isSuperUser,
  setSaving,
  permissions,
  selectedRole,
  setHasChanges,
  setAlert,
  setPermissions,
  setOriginalUserPermissions,
) => {
  if (!selectedUser || isSuperUser) return;

  setSaving(true);

  try {
    const payload: {
      permissions: any;
      selectedUser: any;
      selectedRole?: string;
    } = {
      permissions,
      selectedUser,
    };

    // Only add selectedRole if one is actually selected
    if (selectedRole && selectedRole.name) {
      payload.selectedRole = selectedRole.name;
    }

    // Save the permissions
    const saveResponse = await apiClient.put(
      API_ENDPOINTS.SAVE_USER_PERMISSIONS,
      payload,
    );

    if (saveResponse.status === 200) {
      // Set local success state first
      setHasChanges(false);

      // Show success message immediately
      setAlert({
        open: true,
        message: "Permissions updated successfully",
        severity: "success",
      });

      // Fetch updated permissions from database to ensure UI sync
      try {
        const updatedPermissionsResponse = await apiClient(
          API_ENDPOINTS.GET_USER_PERMISSIONS(selectedUser),
        );

        let updatedPermissions: any[] = [];
        if (updatedPermissionsResponse.data) {
          if (Array.isArray(updatedPermissionsResponse.data)) {
            updatedPermissions = updatedPermissionsResponse.data;
          } else if (
            updatedPermissionsResponse.data.data &&
            Array.isArray(updatedPermissionsResponse.data.data)
          ) {
            updatedPermissions = updatedPermissionsResponse.data.data;
          } else if (
            updatedPermissionsResponse.data.permissions &&
            Array.isArray(updatedPermissionsResponse.data.permissions)
          ) {
            updatedPermissions = updatedPermissionsResponse.data.permissions;
          }
        }

        setPermissions(updatedPermissions);
        setOriginalUserPermissions([...updatedPermissions]);
      } catch (fetchError) {
        console.warn(
          "Failed to fetch updated permissions after save:",
          fetchError,
        );

        setAlert({
          open: true,
          message:
            "Permissions saved successfully, but failed to refresh. Please reload the page to see updates.",
          severity: "warning",
        });
      }
    } else {
      throw new Error(`Save operation returned status ${saveResponse.status}`);
    }
  } catch (error) {
    console.error("Error saving permissions:", error);

    let errorMessage = "Error updating permissions";

    if (error.message === "Network Error") {
      errorMessage =
        "Network Error, your details will be submitted when you are back online";
    } else if (error.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    setAlert({
      open: true,
      message: errorMessage,
      severity: "error",
    });
  } finally {
    setSaving(false);
  }
};

export default saveUserPermissions;
