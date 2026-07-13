import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Checkbox from "@mui/material/Checkbox";
import Typography from "@mui/material/Typography";

const SCOPE_LABELS: Record<string, string> = {
  self: "Self",
  team: "Team",
  all: "All",
  "-": "Global",
};

interface PermissionMatrixProps {
  activeModule: string;
  permissionStructure: Record<string, { actions: Record<string, string[]> }>;
  isChecked: (module: string, action: string, scope: string) => boolean;
  onToggle: (module: string, action: string, scope: string) => void;
  disabled?: boolean;
  disabledTooltip?: string;
}

function PermissionMatrix({
  activeModule,
  permissionStructure,
  isChecked,
  onToggle,
  disabled = false,
  disabledTooltip = "",
}: PermissionMatrixProps) {
  const moduleStructure = permissionStructure[activeModule];

  if (!moduleStructure)
    return <Typography>Module structure not found</Typography>;

  const actions = Object.keys(moduleStructure.actions);

  const availableScopes = ["self", "team", "all", "-"].filter((scope) =>
    actions.some((action) => moduleStructure.actions[action].includes(scope)),
  );

  return (
    <Box sx={{ maxHeight: 450, overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ bgcolor: "action.hover", fontWeight: 600 }}>
              Action
            </TableCell>
            {availableScopes.map((scope) => (
              <TableCell
                key={scope}
                align="right"
                sx={{ bgcolor: "action.hover", fontWeight: 600 }}
              >
                {SCOPE_LABELS[scope]}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {actions.map((action) => (
            <TableRow key={action} hover>
              <TableCell>
                {action
                  .split("_")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(" ")}
              </TableCell>
              {availableScopes.map((scope) => {
                const isValidScope =
                  moduleStructure.actions[action].includes(scope);
                return (
                  <TableCell key={scope} align="right">
                    {isValidScope ? (
                      <Checkbox
                        checked={isChecked(activeModule, action, scope)}
                        onChange={() => onToggle(activeModule, action, scope)}
                        disabled={disabled}
                        size="small"
                        title={disabledTooltip}
                      />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export default PermissionMatrix;
