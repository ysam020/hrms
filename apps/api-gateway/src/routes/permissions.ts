import { Router } from "express";
import { authenticate, requireSuperUser } from "../middleware/authenticate";
import * as h from "../handlers/permissions";

export const permissionsRouter: Router = Router();

permissionsRouter.get("/get-roles", authenticate, h.getRoles);
permissionsRouter.post(
  "/create-role",
  authenticate,
  requireSuperUser,
  h.createRole,
);
permissionsRouter.delete(
  "/delete-role/:_id",
  authenticate,
  requireSuperUser,
  h.deleteRole,
);
permissionsRouter.put(
  "/update-role-permissions/:_id",
  authenticate,
  requireSuperUser,
  h.updateRolePermissions,
);
permissionsRouter.get(
  "/get-role-permissions/:_id",
  authenticate,
  h.getRolePermissions,
);
permissionsRouter.get(
  "/get-role-and-permissions",
  authenticate,
  h.getRoleAndPermissions,
);
permissionsRouter.put(
  "/save-user-permissions",
  authenticate,
  requireSuperUser,
  h.saveUserPermissions,
);
permissionsRouter.get(
  "/get-user-permissions/:username",
  authenticate,
  h.getUserPermissions,
);
permissionsRouter.put(
  "/update-superuser/:username",
  authenticate,
  requireSuperUser,
  h.updateSuperuser,
);
permissionsRouter.post(
  "/delete-user-role",
  authenticate,
  requireSuperUser,
  h.deleteUserRole,
);
permissionsRouter.get("/get-teams", authenticate, h.getTeams);
permissionsRouter.get("/get-org-chart", authenticate, h.getOrgChart);
permissionsRouter.post(
  "/create-team",
  authenticate,
  requireSuperUser,
  h.createTeam,
);
permissionsRouter.delete(
  "/delete-team/:_id",
  authenticate,
  requireSuperUser,
  h.deleteTeam,
);
permissionsRouter.put(
  "/add-team-members",
  authenticate,
  requireSuperUser,
  h.addTeamMembers,
);
permissionsRouter.post(
  "/delete-user-from-team",
  authenticate,
  requireSuperUser,
  h.deleteUserFromTeam,
);
