const togglePermission = (
  module,
  action,
  scope,
  isSuperUser,
  permissions,
  setPermissions,
  setHasChanges,
  originalUserPermissions
) => {
  // If super user, don't allow toggling
  if (isSuperUser) {
    return;
  }

  let updatedPermissions = [...permissions];

  // Handling for JobOpenings and similar modules that use a different format
  if (scope === "-") {
    const permissionString = `${module}:${action}`;
    const hasExactPermission = updatedPermissions.includes(permissionString);

    if (hasExactPermission) {
      updatedPermissions = updatedPermissions.filter(
        (p) => p !== permissionString
      );
    } else {
      updatedPermissions.push(permissionString);
    }
  } else {
    // For independent scope permissions (no hierarchical dependencies)
    const permissionString = `${module}:${action}:${scope}`;
    const hasPermission = updatedPermissions.includes(permissionString);

    if (hasPermission) {
      // Remove only the specific permission being unchecked
      updatedPermissions = updatedPermissions.filter(
        (p) => p !== permissionString
      );
    } else {
      // Add only the specific permission being checked
      updatedPermissions.push(permissionString);
    }
  }

  setPermissions(updatedPermissions);

  // Check if permissions have actually changed from original
  if (originalUserPermissions) {
    const hasActualChanges = !arraysEqual(
      [...updatedPermissions].sort(),
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

export default togglePermission;
