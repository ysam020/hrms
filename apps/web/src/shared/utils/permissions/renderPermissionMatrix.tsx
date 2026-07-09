import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Checkbox from "@mui/material/Checkbox";
import DataList from "@web/shared/components/DataList";

const isCheckboxDisabled = (isSuperUser) => {
  // Only disable if user is a super user
  return isSuperUser;
};

const renderPermissionMatrix = (
  activeModule,
  permissionStructure,
  isSuperUser,
  hasPermission,
  permissions,
  togglePermission,
  setPermissions,
  setHasChanges,
) => {
  const module = activeModule;
  const moduleStructure = permissionStructure[module];

  if (!moduleStructure)
    return <Typography>Module structure not found</Typography>;

  const actions = Object.keys(moduleStructure.actions);

  const availableScopes = ["self", "team", "all", "-"].filter((scope) =>
    actions.some((action) => moduleStructure.actions[action].includes(scope)),
  );

  const isDisabled = isCheckboxDisabled(isSuperUser);
  const tooltipMessage = isSuperUser
    ? "Super admin permissions cannot be modified"
    : "";

  return (
    <Box
      sx={{
        maxHeight: 450,
        overflow: "auto",
        mt: 2,
      }}
    >
      <DataList
        ariaLabel={`Permission matrix for ${module}`}
        variant="rows"
        data={actions}
        getRowId={(action: string) => action}
        columns={[
          {
            key: "action",
            label: "Action",
            primary: true,
            hideLabel: true,
            render: (action: string) =>
              action
                .split("_")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" "),
          },
          ...availableScopes.map((scope) => ({
            key: scope,
            label:
              scope === "-"
                ? "Global"
                : scope.charAt(0).toUpperCase() + scope.slice(1),
            render: (action: string) => {
              const isValidScope =
                moduleStructure.actions[action].includes(scope);
              return isValidScope ? (
                <Checkbox
                  checked={hasPermission(
                    module,
                    action,
                    scope,
                    isSuperUser,
                    permissions,
                  )}
                  onChange={() =>
                    togglePermission(
                      module,
                      action,
                      scope,
                      isSuperUser,
                      permissions,
                      setPermissions,
                      setHasChanges,
                    )
                  }
                  disabled={isDisabled}
                  size="small"
                  title={tooltipMessage}
                />
              ) : (
                "—"
              );
            },
          })),
        ]}
      />
    </Box>
  );
};

export default renderPermissionMatrix;
