const handleRoleChange = (
  e,
  setSelectedRole,
  setPermissions,
  setIsSuperUser,
  setHasChanges,
  originalUserPermissions
) => {
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

  // Check if permissions have actually changed from original
  if (originalUserPermissions) {
    const hasActualChanges = !arraysEqual(
      [...newPermissions].sort(),
      [...originalUserPermissions].sort()
    );
    setHasChanges(hasActualChanges);
  } else {
    // Fallback if originalUserPermissions is not available
    setHasChanges(true);
  }
};

// Helper function to compare arrays
const arraysEqual = (a, b) => {
  if (a.length !== b.length) return false;
  return a.every((val, index) => val === b[index]);
};

export default handleRoleChange;
