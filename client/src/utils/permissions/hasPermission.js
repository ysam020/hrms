const hasPermission = (module, action, scope, isSuperUser, permissions) => {
  // If user is a super user, they have all permissions
  if (isSuperUser) {
    return true;
  }

  // For permissions with different formats (like JobOpenings)
  if (scope === "-") {
    return permissions.includes(`${module}:${action}`);
  }

  // For independent scope permissions - check only exact match
  return permissions.includes(`${module}:${action}:${scope}`);
};

export default hasPermission;
