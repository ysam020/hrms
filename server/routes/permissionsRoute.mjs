import express from "express";
import isAuthenticated from "../middlewares/isAuthenticated.mjs";
import checkPermission from "../middlewares/permissionCheck.mjs";
import createRole from "../controllers/permissions/createRole.mjs";
import getRoles from "../controllers/permissions/getRoles.mjs";
import deleteRole from "../controllers/permissions/deleteRole.mjs";
import updateRolePermissions from "../controllers/permissions/updateRolePermissions.mjs";
import getRolePermissions from "../controllers/permissions/getRolePermissions.mjs";
import getRoleAndPermissions from "../controllers/permissions/getRoleAndPermissions.mjs";
import saveUserPermissions from "../controllers/permissions/saveUserPermissions.mjs";
import getUserPermissions from "../controllers/permissions/getUserPermissions.mjs";
import deleteUserRole from "../controllers/permissions/deleteUserRole.mjs";
import createTeam from "../controllers/permissions/createTeam.mjs";
import getTeams from "../controllers/permissions/getTeams.mjs";
import deleteTeam from "../controllers/permissions/deleteTeam.mjs";
import deleteUserFromTeam from "../controllers/permissions/deleteUserFromTeam.mjs";
import addTeamMembers from "../controllers/permissions/addTeamMembers.mjs";
import updateSuperuser from "../controllers/permissions/updateSuperuser.mjs";

const router = express.Router();

router.post(
  "/api/create-role",
  isAuthenticated,
  checkPermission("Permissions", "create_role"),
  createRole
);
router.get(
  "/api/get-roles",
  isAuthenticated,
  checkPermission("Permissions", "view_roles"),
  getRoles
);
router.delete(
  "/api/delete-role/:_id",
  isAuthenticated,
  checkPermission("Permissions", "delete_role"),
  deleteRole
);
router.put(
  "/api/update-role-permissions/:_id",
  isAuthenticated,
  checkPermission("Permissions", "manage_role_permissions"),
  updateRolePermissions
);
router.get(
  "/api/get-role-permissions/:_id",
  isAuthenticated,
  checkPermission("Permissions", "view_role_permissions"),
  getRolePermissions
);
router.get(
  "/api/get-role-and-permissions",
  isAuthenticated,
  getRoleAndPermissions
);
router.put(
  "/api/save-user-permissions",
  isAuthenticated,
  checkPermission("Permissions", "assign_user_permissions"),
  saveUserPermissions
);
router.get(
  "/api/get-user-permissions/:username",
  isAuthenticated,
  checkPermission("Permissions", "view_user_permissions"),
  getUserPermissions
);
router.post(
  "/api/delete-user-role",
  isAuthenticated,
  checkPermission("Permissions", "delete_role"),
  deleteUserRole
);
router.post(
  "/api/create-team",
  isAuthenticated,
  checkPermission("Permissions", "create_team"),
  createTeam
);
router.get(
  "/api/get-teams",
  isAuthenticated,
  checkPermission("Permissions", "view_teams"),
  getTeams
);
router.delete(
  "/api/delete-team/:_id",
  isAuthenticated,
  checkPermission("Permissions", "delete_team"),
  deleteTeam
);
router.post(
  "/api/delete-user-from-team",
  isAuthenticated,
  checkPermission("Permissions", "delete_team_member"),
  deleteUserFromTeam
);
router.put(
  "/api/add-team-members",
  isAuthenticated,
  checkPermission("Permissions", "add_team_member"),
  addTeamMembers
);
router.put(
  "/api/update-superuser/:username",
  isAuthenticated,
  checkPermission("Permissions", (req) =>
    req.body.isSuperUser ? "assign_superuser" : "revoke_superuser"
  ),
  updateSuperuser
);

export default router;
