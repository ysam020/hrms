import apiClient from "../../config/axiosConfig";

// Save role permissions
const saveUserPermissions = async (
  selectedUser,
  isSuperUser,
  setSaving,
  permissions,
  selectedRole,
  setHasChanges,
  setAlert
) => {
  if (!selectedUser || isSuperUser) return;

  setSaving(true);

  try {
    await apiClient.put(`/save-user-permissions`, {
      permissions,
      selectedUser,
      selectedRole: selectedRole?.name,
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

export default saveUserPermissions;
