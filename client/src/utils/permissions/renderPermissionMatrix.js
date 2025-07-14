import Box from "@mui/material/Box";
import {
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
} from "@mui/material";

const isCheckboxDisabled = (isSuperUser) => {
  // Only disable if user is a super user
  return isSuperUser;
};

// Updated renderPermissionMatrix with the new isCheckboxDisabled logic
const renderPermissionMatrix = (
  activeModule,
  permissionStructure,
  isSuperUser,
  hasPermission,
  permissions,
  togglePermission,
  setPermissions,
  setHasChanges
) => {
  const module = activeModule;
  const moduleStructure = permissionStructure[module];

  if (!moduleStructure)
    return <Typography>Module structure not found</Typography>;

  const actions = Object.keys(moduleStructure.actions);

  // Get all unique scopes used in this module
  const availableScopes = ["self", "team", "all", "-"].filter((scope) =>
    actions.some((action) => moduleStructure.actions[action].includes(scope))
  );

  return (
    <Box
      sx={{
        maxHeight: 450,
        overflow: "auto",
        mt: 2,
      }}
    >
      <TableContainer component={Paper}>
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
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(" ")}
                </TableCell>
                {availableScopes.map((scope) => {
                  // Only show checkboxes for scopes that are valid for this action
                  const isValidScope =
                    moduleStructure.actions[action].includes(scope);

                  // Check if this checkbox should be disabled (only for super users now)
                  const isDisabled = isCheckboxDisabled(isSuperUser);

                  // Create tooltip message for disabled checkboxes
                  const getTooltipMessage = () => {
                    if (isSuperUser)
                      return "Super admin permissions cannot be modified";
                    return "";
                  };

                  return isValidScope ? (
                    <TableCell
                      key={scope}
                      align="center"
                      sx={{ py: 0, px: 1 }}
                      title={getTooltipMessage()}
                    >
                      <Checkbox
                        checked={hasPermission(
                          module,
                          action,
                          scope,
                          isSuperUser,
                          permissions
                        )}
                        onChange={() =>
                          togglePermission(
                            module,
                            action,
                            scope,
                            isSuperUser,
                            permissions,
                            setPermissions,
                            setHasChanges
                          )
                        }
                        disabled={isDisabled}
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
                        checked={hasPermission(
                          module,
                          action,
                          scope,
                          isSuperUser,
                          permissions
                        )}
                        onChange={() =>
                          togglePermission(
                            module,
                            action,
                            scope,
                            isSuperUser,
                            permissions,
                            setPermissions,
                            setHasChanges
                          )
                        }
                        disabled={isSuperUser}
                        size="small"
                      />
                    </TableCell>
                  ) : (
                    <TableCell key={scope} align="center" sx={{ py: 0, px: 1 }}>
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

export default renderPermissionMatrix;
